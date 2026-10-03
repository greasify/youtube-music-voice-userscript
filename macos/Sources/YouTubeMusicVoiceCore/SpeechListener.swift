import AVFoundation
import Foundation
import Speech

final class SpeechListener {
  var onIssue: (String) -> Void = { _ in }
  var onStopped: () -> Void = {}
  var onTranscript: (String, Bool) -> Void = { _, _ in }

  private let queue = DispatchQueue(label: "ymv.speech")
  private let audioEngine = AVAudioEngine()
  private let taskLifetime: TimeInterval = 45
  private let quietBeforeRotate: TimeInterval = 1
  private var announcedNetworkFallback = false
  private var bufferBox = BufferBox()
  private var currentTaskOnDevice = false
  private var errorRotateWork: DispatchWorkItem?
  private var forceNetworkRecognition = false
  private var generation = 0
  private var language = VoiceLanguage.russian
  private var lastHypothesisAt = Date.distantPast
  private var lifetimeTimer: DispatchSourceTimer?
  private var recognizer: SFSpeechRecognizer?
  private var tapInstalled = false
  private var task: SFSpeechRecognitionTask?
  private var taskStartedAt = Date()
  private var wanted = false

  func start(language: VoiceLanguage) {
    queue.async {
      if self.language != language {
        self.forceNetworkRecognition = false
        self.announcedNetworkFallback = false
      }
      self.language = language
      self.wanted = true
      SFSpeechRecognizer.requestAuthorization { status in
        self.queue.async {
          guard self.wanted else { return }
          guard status == .authorized else {
            self.fail("speech-denied")
            return
          }
          self.requestMicrophone()
        }
      }
    }
  }

  func stop() {
    queue.async {
      self.wanted = false
      self.generation += 1
      self.teardown()
    }
  }

  private func requestMicrophone() {
    AVAudioApplication.requestRecordPermission { granted in
      self.queue.async {
        guard self.wanted else { return }
        guard granted else {
          self.fail("mic-denied")
          return
        }
        self.recreate()
      }
    }
  }

  private func noteNetworkFallback() {
    guard !announcedNetworkFallback else { return }
    announcedNetworkFallback = true
    DispatchQueue.main.async {
      self.onIssue("on-device-missing")
    }
  }

  private func fail(_ code: String) {
    wanted = false
    teardown()
    DispatchQueue.main.async {
      self.onIssue(code)
      self.onStopped()
    }
  }

  private func recreate() {
    guard wanted else { return }
    generation += 1
    let generation = self.generation
    teardown()

    do {
      try begin(generation)
    }
    catch {
      DispatchQueue.main.async {
        self.onIssue("failed")
      }
      scheduleFullRestart()
    }
  }

  private func scheduleFullRestart() {
    guard errorRotateWork == nil else { return }
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.errorRotateWork = nil
      self.recreate()
    }
    errorRotateWork = work
    queue.asyncAfter(deadline: .now() + 0.2, execute: work)
  }

  private func begin(_ generation: Int) throws {
    guard let recognizer = SFSpeechRecognizer(locale: language.locale) else {
      DispatchQueue.main.async {
        self.onIssue("unavailable")
      }
      throw SpeechListenError.unavailable
    }

    guard recognizer.isAvailable else {
      DispatchQueue.main.async {
        self.onIssue("unavailable")
      }
      throw SpeechListenError.unavailable
    }

    self.recognizer = recognizer
    let input = audioEngine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      throw SpeechListenError.noInput
    }

    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [bufferBox] buffer, _ in
      bufferBox.append(buffer)
    }
    tapInstalled = true
    audioEngine.prepare()
    try audioEngine.start()
    startTask(generation)
  }

  /// Swap the recognition request without stopping the microphone.
  /// The new request is installed before the old one is closed, so the tap never writes into a finished request.
  private func rotateTask() {
    guard wanted, recognizer != nil, tapInstalled else { return }
    generation += 1
    startTask(generation)
  }

  private func startTask(_ generation: Int) {
    guard let recognizer, wanted else { return }
    errorRotateWork?.cancel()
    errorRotateWork = nil

    let request = makeRequest()
    let previous = bufferBox.swap(to: request)
    previous?.endAudio()
    task?.cancel()
    task = nil
    taskStartedAt = Date()
    armLifetime(generation)

    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      self?.queue.async {
        self?.handle(generation: generation, result: result, error: error)
      }
    }
  }

  private func makeRequest() -> SFSpeechAudioBufferRecognitionRequest {
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    request.taskHint = .dictation
    let onDevice = (recognizer?.supportsOnDeviceRecognition ?? false) && !forceNetworkRecognition
    currentTaskOnDevice = onDevice
    request.requiresOnDeviceRecognition = onDevice
    if !onDevice {
      noteNetworkFallback()
    }
    return request
  }

  private func handle(generation: Int, result: SFSpeechRecognitionResult?, error: Error?) {
    guard generation == self.generation, wanted else { return }

    if let result {
      lastHypothesisAt = Date()
      let text = result.bestTranscription.formattedString
      let isFinal = result.isFinal
      DispatchQueue.main.async {
        self.onTranscript(text, isFinal)
      }
      if isFinal {
        rotateTask()
        return
      }
    }

    guard error != nil else { return }

    if result == nil, currentTaskOnDevice, Date().timeIntervalSince(taskStartedAt) < 1.5 {
      forceNetworkRecognition = true
      noteNetworkFallback()
    }
    scheduleErrorRotate()
  }

  private func scheduleErrorRotate() {
    guard errorRotateWork == nil else { return }
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.errorRotateWork = nil
      self.rotateTask()
    }
    errorRotateWork = work
    queue.asyncAfter(deadline: .now() + 0.2, execute: work)
  }

  private func armLifetime(_ generation: Int) {
    scheduleLifetime(generation, after: taskLifetime)
  }

  private func scheduleLifetime(_ generation: Int, after delay: TimeInterval) {
    lifetimeTimer?.cancel()
    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(deadline: .now() + delay)
    timer.setEventHandler { [weak self] in
      self?.lifetimeFired(generation)
    }
    lifetimeTimer = timer
    timer.resume()
  }

  private func lifetimeFired(_ generation: Int) {
    guard generation == self.generation, wanted else { return }
    if Date().timeIntervalSince(lastHypothesisAt) < quietBeforeRotate {
      scheduleLifetime(generation, after: quietBeforeRotate)
      return
    }
    rotateTask()
  }

  private func teardown() {
    errorRotateWork?.cancel()
    errorRotateWork = nil
    lifetimeTimer?.cancel()
    lifetimeTimer = nil
    task?.cancel()
    task = nil
    bufferBox.swap(to: nil)?.endAudio()
    recognizer = nil

    if audioEngine.isRunning {
      audioEngine.stop()
    }
    if tapInstalled {
      audioEngine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
  }
}

private final class BufferBox {
  private let lock = NSLock()
  private var request: SFSpeechAudioBufferRecognitionRequest?

  func append(_ buffer: AVAudioPCMBuffer) {
    lock.lock()
    request?.append(buffer)
    lock.unlock()
  }

  func swap(to next: SFSpeechAudioBufferRecognitionRequest?) -> SFSpeechAudioBufferRecognitionRequest? {
    lock.lock()
    let previous = request
    request = next
    lock.unlock()
    return previous
  }
}

private enum SpeechListenError: Error {
  case noInput
  case unavailable
}
