import Combine
import Foundation
import ServiceManagement

public final class AppModel: ObservableObject {
  @Published public private(set) var language: VoiceLanguage
  @Published public private(set) var lastDecision = ""
  @Published public private(set) var launchAtLogin: Bool
  @Published public private(set) var listening: Bool
  @Published public private(set) var note = ""

  private let listener = SpeechListener()
  private let scorer = IntentScorer()
  private let server: CommandServer
  private var armedHold = ""
  private var consumed = ""
  private var fired: [PlayerCommand] = []
  private var holdToken = 0

  public init(server: CommandServer = CommandServer()) {
    let defaults = UserDefaults.standard
    let storedLanguage = VoiceLanguage(rawValue: defaults.string(forKey: Keys.language) ?? "")
    language = storedLanguage ?? Self.systemLanguage()
    listening = false
    launchAtLogin = SMAppService.mainApp.status == .enabled
    self.server = server

    listener.onTranscript = { [weak self] text, isFinal in
      self?.consume(text: text, isFinal: isFinal)
    }
    listener.onIssue = { [weak self] code in
      self?.applyIssue(code)
    }
    listener.onStopped = { [weak self] in
      self?.listening = false
      UserDefaults.standard.set(false, forKey: Keys.listening)
    }

    server.onNeedsBrowser = {
      BrowserLauncher.openYouTubeMusic()
    }
    server.onResult = { [weak self] name, ok in
      DispatchQueue.main.async {
        guard let self else { return }
        let state = ok ? "ok" : "failed"
        self.note = "\(name) · \(state)"
      }
    }

    do {
      try server.start()
    }
    catch {
      note = error.localizedDescription
    }

    let shouldListen = defaults.object(forKey: Keys.listening) as? Bool ?? true
    if shouldListen {
      setListening(true)
    }
  }

  public func setListening(_ on: Bool) {
    listening = on
    UserDefaults.standard.set(on, forKey: Keys.listening)
    resetUtterance()
    if on {
      note = ""
      listener.start(language: language)
      return
    }
    listener.stop()
  }

  public func setLanguage(_ language: VoiceLanguage) {
    guard self.language != language else { return }
    self.language = language
    UserDefaults.standard.set(language.rawValue, forKey: Keys.language)
    resetUtterance()
    guard listening else { return }
    listener.stop()
    listener.start(language: language)
  }

  public func openMusic() {
    BrowserLauncher.openYouTubeMusic()
  }

  public func setLaunchAtLogin(_ on: Bool) {
    do {
      if on {
        try SMAppService.mainApp.register()
      }
      else {
        try SMAppService.mainApp.unregister()
      }
    }
    catch {
      note = error.localizedDescription
    }
    launchAtLogin = SMAppService.mainApp.status == .enabled
  }

  public func quit() {
    listener.stop()
    server.stop()
  }

  private func consume(text: String, isFinal: Bool) {
    let transcript = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !transcript.isEmpty else { return }

    let normalized = normalize(transcript)
    let pieces = scorer.segment(transcript: transcript, language: language, committing: isFinal)

    if pieces.isEmpty {
      disarmHold()
      guard isFinal else { return }
      if let scored = scorer.score(transcript: transcript, language: language) {
        lastDecision = String(
          format: "%@ → %@ %.2f",
          transcript,
          scored.command.wireName,
          scored.confidence
        )
        deliver(scored.command, transcript: transcript, confidence: scored.confidence)
      }
      else {
        lastDecision = "\(transcript) → —"
      }
      resetUtterance()
      return
    }

    realign(normalized: normalized, pieces: pieces)
    lastDecision = "\(transcript) → \(pieces.map(\.command.wireName).joined(separator: ", "))"

    let pending = pieces.filter { piece in
      piece.covered != consumed && (consumed.isEmpty || piece.covered.hasPrefix(consumed))
    }

    guard !pending.isEmpty else {
      if isFinal {
        resetUtterance()
      }
      return
    }

    for (index, piece) in pending.enumerated() {
      if swallowGrowth(piece, pieces: pieces) {
        continue
      }

      let isLast = index == pending.count - 1
      let terminal = piece.covered == normalized
      if !isLast || !terminal || isFinal {
        disarmHold()
        commit(piece, transcript: transcript)
        continue
      }

      let tail = commandTail(normalized: normalized, previous: consumed)
      let scored = ScoredIntent(command: piece.command, confidence: piece.confidence, margin: piece.margin)
      if scorer.canEarlyFire(transcript: tail, scored: scored, language: language) {
        armHold(piece, transcript: transcript)
      }
      else {
        disarmHold()
      }
    }

    if isFinal {
      resetUtterance()
    }
  }

  /// The recognizer sometimes rewrites a word ("пауза" → "паузу") instead of appending.
  /// Commands already sent stay sent when they still lead the new reading.
  private func realign(normalized: String, pieces: [SegmentedCommand]) {
    guard !consumed.isEmpty, !normalized.hasPrefix(consumed) else { return }

    var kept = ""
    var keptCount = 0
    for piece in pieces {
      guard keptCount < fired.count, piece.command == fired[keptCount] else { break }
      guard normalized == piece.covered || normalized.hasPrefix(piece.covered) else { break }
      kept = piece.covered
      keptCount += 1
    }
    consumed = kept
    fired = Array(fired.prefix(keptCount))
    disarmHold()
  }

  /// "включи" and "включи музыку" are the same play. A second "дальше" is not.
  private func swallowGrowth(_ piece: SegmentedCommand, pieces: [SegmentedCommand]) -> Bool {
    guard let last = fired.last, last == piece.command, pieces.count == fired.count else {
      return false
    }
    consumed = piece.covered
    return true
  }

  private func commandTail(normalized: String, previous: String) -> String {
    guard !previous.isEmpty, normalized.hasPrefix(previous) else { return normalized }
    return String(normalized.dropFirst(previous.count)).trimmingCharacters(in: .whitespaces)
  }

  private func armHold(_ piece: SegmentedCommand, transcript: String) {
    let key = "\(piece.covered)|\(piece.command.dedupeKey)"
    guard key != armedHold else { return }
    armedHold = key
    holdToken += 1
    let token = holdToken
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
      guard let self, token == self.holdToken else { return }
      self.armedHold = ""
      self.commit(piece, transcript: transcript)
    }
  }

  private func disarmHold() {
    holdToken += 1
    armedHold = ""
  }

  private func commit(_ piece: SegmentedCommand, transcript: String) {
    guard consumed != piece.covered else { return }
    consumed = piece.covered
    fired.append(piece.command)
    deliver(piece.command, transcript: transcript, confidence: piece.confidence)
  }

  private func resetUtterance() {
    disarmHold()
    consumed = ""
    fired = []
  }

  private func deliver(_ command: PlayerCommand, transcript: String, confidence: Double) {
    note = ""
    let wire = WireCommand(
      id: UUID().uuidString,
      command: command,
      transcript: transcript,
      confidence: confidence
    )

    server.submit(wire) { [weak self] delivered in
      DispatchQueue.main.async {
        guard let self, !delivered else { return }
        self.note = self.language == .russian ? "Браузер не ответил" : "Browser did not answer"
      }
    }
  }

  private func applyIssue(_ code: String) {
    switch code {
    case "mic-denied":
      note = language == .russian ? "Нет доступа к микрофону" : "Microphone permission denied"
    case "speech-denied":
      note = language == .russian ? "Нет доступа к распознаванию речи" : "Speech recognition permission denied"
    case "unavailable":
      note = language == .russian ? "Распознавание речи недоступно" : "Speech recognizer unavailable"
    case "on-device-missing":
      note = language == .russian
        ? "Нет локальной модели, слушаю через системное распознавание"
        : "On-device model missing, using the system recognizer"
    default:
      note = language == .russian ? "Сбой распознавания" : "Speech recognition failed"
    }
  }

  private static func systemLanguage() -> VoiceLanguage {
    let preferred = Locale.preferredLanguages.first ?? "en"
    return preferred.lowercased().hasPrefix("ru") ? .russian : .english
  }
}

private enum Keys {
  static let language = "ymv.language"
  static let listening = "ymv.listening"
}
