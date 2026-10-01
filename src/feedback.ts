const SUCCESS_HZ = 880
const ALREADY_HZ = 440
const SUCCESS_MS = 80
const ALREADY_MS = 50

let context: AudioContext | undefined

function getContext() {
  context ??= new AudioContext()
  return context
}

export function resumeFeedback() {
  void getContext().resume()
}

function playTick(frequency: number, durationMs: number, delayMs = 0) {
  const ctx = getContext()
  if (ctx.state === 'suspended') return

  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  const now = ctx.currentTime + delayMs / 1000
  const end = now + durationMs / 1000

  oscillator.type = 'sine'
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(0.12, now)
  gain.gain.exponentialRampToValueAtTime(0.001, end)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(now)
  oscillator.stop(end)
}

export function playLikeFeedback(already: boolean) {
  if (already) {
    playTick(ALREADY_HZ, ALREADY_MS)
    return
  }

  playTick(SUCCESS_HZ, SUCCESS_MS)
}

const REPEAT_NOTE_MS = 70
const REPEAT_SECOND_MS = 90
const REPEAT_GAP_MS = 80

export function playRepeatFeedback(enabled: boolean, already: boolean) {
  if (already) {
    playTick(enabled ? 784 : 392, ALREADY_MS)
    return
  }

  if (enabled) {
    playTick(523, REPEAT_NOTE_MS)
    playTick(784, REPEAT_SECOND_MS, REPEAT_GAP_MS)
    return
  }

  playTick(784, REPEAT_NOTE_MS)
  playTick(392, REPEAT_SECOND_MS, REPEAT_GAP_MS)
}
