import Foundation
import NaturalLanguage

public enum VoiceLanguage: String {
  case english
  case russian

  public var locale: Locale {
    switch self {
    case .english:
      return Locale(identifier: "en-US")
    case .russian:
      return Locale(identifier: "ru-RU")
    }
  }

  var nlLanguage: NLLanguage {
    switch self {
    case .english:
      return .english
    case .russian:
      return .russian
    }
  }
}

public enum PlayerCommand: Equatable {
  case like
  case next
  case pause
  case play
  case prev
  case repeatOff
  case repeatOne
  case setVolume(Int)
  case volumeDown
  case volumeUp

  public var wireName: String {
    switch self {
    case .like: return "like"
    case .next: return "next"
    case .pause: return "pause"
    case .play: return "play"
    case .prev: return "prev"
    case .repeatOff: return "repeatOff"
    case .repeatOne: return "repeatOne"
    case .setVolume: return "setVolume"
    case .volumeDown: return "volumeDown"
    case .volumeUp: return "volumeUp"
    }
  }

  public var level: Int? {
    if case .setVolume(let level) = self {
      return level
    }
    return nil
  }

  public var dedupeKey: String {
    if let level {
      return "setVolume:\(level)"
    }
    return wireName
  }
}

public struct ScoredIntent: Equatable {
  public var command: PlayerCommand
  public var confidence: Double
  public var margin: Double

  public init(command: PlayerCommand, confidence: Double, margin: Double) {
    self.command = command
    self.confidence = confidence
    self.margin = margin
  }
}

public struct SegmentedCommand: Equatable {
  public var command: PlayerCommand
  public var confidence: Double
  public var covered: String
  public var margin: Double
  public var phrase: String
}

private struct Anchor {
  var command: PlayerCommand
  var phrase: String
}

private let maxEmbeddingDistance = 0.72
private let minEmbeddingMargin = 0.04
private let earlyFireMargin = 0.12

public final class IntentScorer {
  private var embeddings: [VoiceLanguage: NLEmbedding] = [:]
  private var missingEmbeddings: Set<VoiceLanguage> = []

  public init() {}

  public func hasEmbedding(for language: VoiceLanguage) -> Bool {
    embedding(for: language) != nil
  }

  /// Reads every command in order. A longer anchor wins at the current position,
  /// so "включи повтор" stays one command while "пауза плей" becomes two.
  ///
  /// While the phrase is still growing (`committing` is false), a short anchor
  /// that is the start of a different command is left unparsed. "stop" can still
  /// become "stop repeat", and "volume 8" can still become "volume 80".
  public func segment(
    transcript: String,
    language: VoiceLanguage,
    committing: Bool = true
  ) -> [SegmentedCommand] {
    let normalized = normalize(transcript)
    guard !normalized.isEmpty else { return [] }

    let phrases = anchors(for: language)
    var rest = normalized
    var covered = ""
    var commands: [SegmentedCommand] = []

    while !rest.isEmpty, commands.count < 16 {
      if let volume = leadingVolume(rest, language: language) {
        let taken = takePrefix(rest, length: volume.length)
        if !committing, taken.rest.isEmpty {
          break
        }
        covered = appendPiece(covered, taken.piece)
        commands.append(SegmentedCommand(
          command: .setVolume(volume.level),
          confidence: 1,
          covered: covered,
          margin: 1,
          phrase: taken.piece
        ))
        rest = taken.rest
        continue
      }

      switch leadingAnchor(rest, anchors: phrases, committing: committing) {
      case .match(let anchor):
        let taken = takePrefix(rest, length: anchor.phrase.count)
        covered = appendPiece(covered, taken.piece)
        commands.append(SegmentedCommand(
          command: anchor.command,
          confidence: 1,
          covered: covered,
          margin: 1,
          phrase: anchor.phrase
        ))
        rest = taken.rest
      case .wait:
        return commands
      case .skip:
        guard let skipped = firstWord(rest) else { return commands }
        covered = appendPiece(covered, skipped.word)
        rest = skipped.rest
      }
    }

    return commands
  }

  public func score(transcript: String, language: VoiceLanguage) -> ScoredIntent? {
    let normalized = normalize(transcript)
    guard !normalized.isEmpty else { return nil }

    if let volume = parseVolume(normalized, language: language) {
      return ScoredIntent(command: .setVolume(volume), confidence: 1, margin: 1)
    }

    let anchors = anchors(for: language)
    // A phrase that already contains a known command wins over the embedding.
    // Sentence vectors for these short lines sit close together, so a loose
    // cosine cutoff would turn "please pause the music" into play.
    if let known = lexiconScore(normalized, anchors: anchors) {
      return known
    }

    if let embedding = embedding(for: language) {
      return semanticScore(normalized, anchors: anchors, embedding: embedding)
    }

    return nil
  }

  /// Partials only fire when the winner is far ahead and the text is not the
  /// start of a different command ("включи" vs "включи повтор").
  public func canEarlyFire(transcript: String, scored: ScoredIntent, language: VoiceLanguage) -> Bool {
    if case .setVolume = scored.command {
      return false
    }

    let confident = scored.margin >= earlyFireMargin || scored.confidence >= 0.99
    guard confident else { return false }

    let normalized = normalize(transcript)
    guard !normalized.isEmpty else { return false }

    for anchor in anchors(for: language) where anchor.command != scored.command {
      if anchor.phrase.hasPrefix(normalized), anchor.phrase != normalized {
        return false
      }
    }

    return true
  }

  private func semanticScore(
    _ normalized: String,
    anchors: [Anchor],
    embedding: NLEmbedding
  ) -> ScoredIntent? {
    var bestDistance: [String: Double] = [:]
    var bestCommand: [String: PlayerCommand] = [:]

    for anchor in anchors {
      let distance = embedding.distance(between: normalized, and: anchor.phrase, distanceType: .cosine)
      let key = anchor.command.dedupeKey
      if let current = bestDistance[key], current <= distance {
        continue
      }
      bestDistance[key] = distance
      bestCommand[key] = anchor.command
    }

    let ranked = bestDistance.sorted { $0.value < $1.value }
    guard let top = ranked.first, let command = bestCommand[top.key] else { return nil }

    let second = ranked.dropFirst().first?.value ?? (top.value + 1)
    let margin = second - top.value
    guard top.value <= maxEmbeddingDistance, margin >= minEmbeddingMargin else { return nil }

    return ScoredIntent(
      command: command,
      confidence: max(0, 1 - top.value),
      margin: margin
    )
  }

  private func lexiconScore(_ normalized: String, anchors: [Anchor]) -> ScoredIntent? {
    let hits = anchors.filter { includesPhrase(normalized, $0.phrase) }
    guard let best = hits.max(by: { $0.phrase.count < $1.phrase.count }) else { return nil }

    let tied = hits.contains { $0.command != best.command && $0.phrase.count == best.phrase.count }
    if tied { return nil }

    let exact = normalized == best.phrase
    return ScoredIntent(command: best.command, confidence: exact ? 1 : 0.95, margin: 1)
  }

  private func embedding(for language: VoiceLanguage) -> NLEmbedding? {
    if let cached = embeddings[language] {
      return cached
    }
    if missingEmbeddings.contains(language) {
      return nil
    }

    guard let model = NLEmbedding.sentenceEmbedding(for: language.nlLanguage) else {
      missingEmbeddings.insert(language)
      return nil
    }

    embeddings[language] = model
    return model
  }
}

private func anchors(for language: VoiceLanguage) -> [Anchor] {
  let phrases: [(PlayerCommand, [String])]
  switch language {
  case .russian:
    phrases = [
      (.play, ["включи музыку", "продолжи воспроизведение", "поставь на плей", "продолжи", "запусти", "поехали", "играй", "включи", "плей"]),
      (.pause, ["поставь на паузу", "на паузу", "останови", "остановить", "паузу", "пауза", "стоп"]),
      (.next, ["следующую песню", "следующий трек", "пропусти", "следующий", "вперед", "дальше", "далее", "скип"]),
      (.prev, ["предыдущий трек", "предыдущий", "верни", "назад"]),
      (.like, ["в избранное", "в любимое", "нравится", "лайк"]),
      (.volumeUp, ["громкость вверх", "погромче", "прибавь", "громче"]),
      (.volumeDown, ["громкость вниз", "потише", "убавь", "тише"]),
      (.repeatOne, ["поставь трек на репит", "поставь трек на повтор", "включи повтор", "поставь на повтор", "поставь на репит", "повтор трека", "зацикли", "повтор", "репит"]),
      (.repeatOff, ["выключи повтор", "отключи повтор", "без повтора", "выключи репит", "отключи репит"]),
    ]
  case .english:
    phrases = [
      (.play, ["play music", "unpause", "resume", "start", "play"]),
      (.pause, ["pause", "stop"]),
      (.next, ["next track", "next song", "forward", "skip", "next"]),
      (.prev, ["previous track", "previous song", "last track", "go back", "previous", "prev", "back"]),
      (.like, ["like this", "love this", "favorite", "like"]),
      (.volumeUp, ["turn it up", "volume up", "turn up", "louder"]),
      (.volumeDown, ["turn it down", "volume down", "turn down", "quieter"]),
      (.repeatOne, ["repeat this track", "repeat track", "repeat one", "loop", "repeat"]),
      (.repeatOff, ["turn repeat off", "turn off repeat", "stop repeating", "stop repeat", "repeat off"]),
    ]
  }

  return phrases.flatMap { command, list in
    list.map { Anchor(command: command, phrase: normalize($0)) }
  }
}

private let russianVolume = try? NSRegularExpression(
  pattern: "(?:громкость|звук)\\s+(?:на\\s+|до\\s+)?(\\d{1,3})(?!\\d)"
)
private let englishVolume = try? NSRegularExpression(
  pattern: "volume\\s+(?:to\\s+)?(\\d{1,3})(?!\\d)"
)

private func parseVolume(_ normalized: String, language: VoiceLanguage) -> Int? {
  let pattern = language == .russian ? russianVolume : englishVolume
  guard let digits = firstCapture(pattern, in: normalized), let level = Int(digits) else { return nil }
  return min(100, max(0, level))
}

private func firstCapture(_ regex: NSRegularExpression?, in text: String) -> String? {
  guard let regex else { return nil }
  let range = NSRange(text.startIndex..., in: text)
  guard let match = regex.firstMatch(in: text, range: range),
        let capture = Range(match.range(at: 1), in: text) else { return nil }
  return String(text[capture])
}

func normalize(_ text: String) -> String {
  let lowered = text.lowercased().replacingOccurrences(of: "ё", with: "е")
  var result = ""
  var pendingSpace = false

  for character in lowered {
    if character.isLetter || character.isNumber {
      if pendingSpace, !result.isEmpty {
        result.append(" ")
      }
      pendingSpace = false
      result.append(character)
    }
    else {
      pendingSpace = true
    }
  }

  return result
}

private func includesPhrase(_ text: String, _ phrase: String) -> Bool {
  text == phrase || text.contains(" \(phrase) ") || text.hasPrefix("\(phrase) ") || text.hasSuffix(" \(phrase)")
}

private struct VolumeMatch {
  var length: Int
  var level: Int
}

private enum AnchorLead {
  case match(Anchor)
  case skip
  case wait
}

private func leadingVolume(_ text: String, language: VoiceLanguage) -> VolumeMatch? {
  let pattern = language == .russian ? russianVolume : englishVolume
  guard let pattern else { return nil }
  let range = NSRange(text.startIndex..., in: text)
  guard let match = pattern.firstMatch(in: text, range: range),
        match.range.location == 0,
        let whole = Range(match.range, in: text),
        let capture = Range(match.range(at: 1), in: text),
        let level = Int(text[capture]) else { return nil }
  let length = text.distance(from: whole.lowerBound, to: whole.upperBound)
  return VolumeMatch(length: length, level: min(100, max(0, level)))
}

private func leadingAnchor(_ rest: String, anchors: [Anchor], committing: Bool) -> AnchorLead {
  let matches = anchors.filter { rest == $0.phrase || rest.hasPrefix("\($0.phrase) ") }
  if let best = matches.max(by: { $0.phrase.count < $1.phrase.count }) {
    let tied = matches.contains { $0.command != best.command && $0.phrase.count == best.phrase.count }
    if !tied {
      let stillGrowing = !committing && anchors.contains { anchor in
        anchor.command != best.command
          && anchor.phrase.count > best.phrase.count
          && anchor.phrase.hasPrefix(rest)
          && anchor.phrase != rest
      }
      if stillGrowing {
        return .wait
      }
      return .match(best)
    }
  }

  let incomplete = anchors.contains { $0.phrase.hasPrefix(rest) && $0.phrase != rest }
  if !committing, incomplete {
    return .wait
  }
  return .skip
}

private func takePrefix(_ text: String, length: Int) -> (piece: String, rest: String) {
  let end = text.index(text.startIndex, offsetBy: length, limitedBy: text.endIndex) ?? text.endIndex
  let piece = String(text[..<end])
  var rest = String(text[end...])
  if rest.first == " " {
    rest.removeFirst()
  }
  return (piece, rest)
}

private func appendPiece(_ covered: String, _ piece: String) -> String {
  covered.isEmpty ? piece : "\(covered) \(piece)"
}

private func firstWord(_ text: String) -> (word: String, rest: String)? {
  guard !text.isEmpty else { return nil }
  guard let space = text.firstIndex(of: " ") else { return (text, "") }
  let word = String(text[..<space])
  let rest = String(text[text.index(after: space)...])
  return (word, rest)
}
