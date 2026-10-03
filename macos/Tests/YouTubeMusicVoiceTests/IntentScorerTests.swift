import XCTest
@testable import YouTubeMusicVoiceCore

final class IntentScorerTests: XCTestCase {
  private let scorer = IntentScorer()

  func testExactPause() {
    let scored = scorer.score(transcript: "Пауза.", language: .russian)
    XCTAssertEqual(scored?.command, .pause)
    XCTAssertEqual(scored?.confidence, 1)
  }

  func testRussianVolume() {
    let scored = scorer.score(transcript: "громкость 32", language: .russian)
    XCTAssertEqual(scored?.command, .setVolume(32))
  }

  func testEnglishVolumeTo() {
    let scored = scorer.score(transcript: "volume to 80", language: .english)
    XCTAssertEqual(scored?.command, .setVolume(80))
  }

  func testVolumeClamps() {
    let scored = scorer.score(transcript: "звук 150", language: .russian)
    XCTAssertEqual(scored?.command, .setVolume(100))
  }

  func testWeatherIsIgnored() {
    let scored = scorer.score(transcript: "какая сегодня погода на улице", language: .russian)
    XCTAssertNil(scored)
  }

  func testStopRepeatIsNotPause() {
    let scored = scorer.score(transcript: "stop repeat", language: .english)
    XCTAssertEqual(scored?.command, .repeatOff)
  }

  func testEarlyFireBlocksAmbiguousPrefix() {
    let scored = scorer.score(transcript: "включи", language: .russian)
    let intent = try? XCTUnwrap(scored)
    XCTAssertEqual(intent?.command, .play)
    if let intent {
      XCTAssertFalse(scorer.canEarlyFire(transcript: "включи", scored: intent, language: .russian))
    }
  }

  func testEarlyFireAllowsPause() {
    let scored = scorer.score(transcript: "пауза", language: .russian)
    let intent = try? XCTUnwrap(scored)
    XCTAssertEqual(intent?.command, .pause)
    if let intent {
      XCTAssertTrue(scorer.canEarlyFire(transcript: "пауза", scored: intent, language: .russian))
    }
  }

  func testEarlyFireSkipsVolumeSlot() {
    let scored = scorer.score(transcript: "volume 8", language: .english)
    let intent = try? XCTUnwrap(scored)
    if let intent {
      XCTAssertFalse(scorer.canEarlyFire(transcript: "volume 8", scored: intent, language: .english))
    }
  }

  func testContainedPauseBeatsEmbedding() {
    let scored = scorer.score(transcript: "please pause the music", language: .english)
    XCTAssertEqual(scored?.command, .pause)
  }

  func testLongerAnchorWins() {
    let scored = scorer.score(transcript: "play the next song", language: .english)
    XCTAssertEqual(scored?.command, .next)
  }

  func testEnglishChatterIsIgnored() {
    XCTAssertNil(scorer.score(transcript: "what is the weather today", language: .english))
  }

  func testRussianContainedPauseWithoutSentenceModel() {
    let scored = scorer.score(transcript: "давай поставь на паузу", language: .russian)
    XCTAssertEqual(scored?.command, .pause)
  }

  func testPauseThenPlayRussian() {
    let pieces = scorer.segment(transcript: "пауза плей", language: .russian)
    XCTAssertEqual(pieces.map(\.command), [.pause, .play])
  }

  func testPauseThenPlayEnglish() {
    let pieces = scorer.segment(transcript: "pause play", language: .english)
    XCTAssertEqual(pieces.map(\.command), [.pause, .play])
  }

  func testRepeatPhraseStaysOneCommand() {
    let pieces = scorer.segment(transcript: "включи повтор", language: .russian)
    XCTAssertEqual(pieces.map(\.command), [.repeatOne])
  }

  func testStopRepeatStaysOneCommand() {
    let pieces = scorer.segment(transcript: "stop repeat", language: .english)
    XCTAssertEqual(pieces.map(\.command), [.repeatOff])
  }

  func testRepeatedNextIsTwoCommands() {
    let pieces = scorer.segment(transcript: "дальше дальше", language: .russian)
    XCTAssertEqual(pieces.map(\.command), [.next, .next])
  }

  func testVolumeThenPlay() {
    let pieces = scorer.segment(transcript: "громкость 40 плей", language: .russian)
    XCTAssertEqual(pieces.map(\.command), [.setVolume(40), .play])
  }

  func testFillerAroundPauseStaysOneCommand() {
    XCTAssertEqual(
      scorer.segment(transcript: "давай поставь на паузу", language: .russian).map(\.command),
      [.pause]
    )
    XCTAssertEqual(
      scorer.segment(transcript: "please pause the music", language: .english).map(\.command),
      [.pause]
    )
  }

  func testOpenPrefixWaitsUntilThePhraseIsFinished() {
    XCTAssertEqual(scorer.segment(transcript: "stop", language: .english, committing: false), [])
    XCTAssertEqual(scorer.segment(transcript: "включи", language: .russian, committing: false), [])
    XCTAssertEqual(
      scorer.segment(transcript: "stop repeat", language: .english, committing: false).map(\.command),
      [.repeatOff]
    )
    XCTAssertEqual(
      scorer.segment(transcript: "stop", language: .english, committing: true).map(\.command),
      [.pause]
    )
  }
}
