type SpeechAlternative = {
  transcript: string
}

type SpeechResult = {
  isFinal: boolean
  0?: SpeechAlternative
}

type SpeechResultEvent = {
  resultIndex: number
  results: ArrayLike<SpeechResult>
}

type SpeechErrorEvent = {
  error: string
}

type SpeechRecognitionInstance = {
  abort?: () => void
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onaudiostart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onresult: ((event: SpeechResultEvent) => void) | null
  onsoundstart: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor
  webkitSpeechRecognition?: SpeechRecognitionCtor
}

export type SpeechLang = 'en-US' | 'ru-RU'

export type SpeechController = {
  readonly lang: SpeechLang
  readonly listening: boolean
  setLang: (lang: SpeechLang) => void
  start: () => void
  stop: () => void
}

export type SpeechCallbacks = {
  lang?: SpeechLang
  onError: (message: string) => void
  onListeningChange: (listening: boolean) => void
  onResult: (transcript: string) => void
}

const RESTART_DELAY_MS = 200
const WATCHDOG_MS = 12_000
const SOFT_RESTART_ERRORS = new Set(['aborted', 'network', 'no-speech'])

export function defaultSpeechLang(): SpeechLang {
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru-RU' : 'en-US'
}

function getSpeechRecognition(): SpeechRecognitionCtor | undefined {
  const view = window as SpeechWindow
  return view.SpeechRecognition ?? view.webkitSpeechRecognition
}

export const isSpeechSupported = () => Boolean(getSpeechRecognition())

export function createSpeechController({
  lang = defaultSpeechLang(),
  onError,
  onListeningChange,
  onResult,
}: SpeechCallbacks): SpeechController {
  const maybeRecognition = getSpeechRecognition()
  if (!maybeRecognition) {
    throw new Error('SpeechRecognition is not supported')
  }
  const SpeechRecognitionAPI: SpeechRecognitionCtor = maybeRecognition

  let currentLang = lang
  let wanted = false
  let generation = 0
  let recognition: SpeechRecognitionInstance | undefined
  let restartTimer = 0
  let watchdogTimer = 0

  function clearRestart() {
    window.clearTimeout(restartTimer)
    restartTimer = 0
  }

  function clearWatchdog() {
    window.clearTimeout(watchdogTimer)
    watchdogTimer = 0
  }

  function clearTimers() {
    clearRestart()
    clearWatchdog()
  }

  function pokeWatchdog() {
    if (!wanted) return
    clearWatchdog()
    watchdogTimer = window.setTimeout(() => {
      if (!wanted) return
      recreateAndStart()
    }, WATCHDOG_MS)
  }

  function killRecognition() {
    const dying = recognition
    recognition = undefined
    if (!dying) return

    try {
      if (dying.abort) dying.abort()
      else dying.stop()
    } catch {
      // Already stopped.
    }
  }

  function createRecognition() {
    const instance = new SpeechRecognitionAPI()
    instance.lang = currentLang
    instance.continuous = true
    instance.interimResults = false
    instance.maxAlternatives = 1
    return instance
  }

  function startRecognition(instance: SpeechRecognitionInstance) {
    try {
      instance.start()
    } catch {
      // Already running, or start() was called twice.
    }
  }

  function scheduleRestart() {
    if (!wanted) return
    clearRestart()
    restartTimer = window.setTimeout(() => {
      if (!wanted) return
      recreateAndStart()
    }, RESTART_DELAY_MS)
  }

  function bind(instance: SpeechRecognitionInstance, gen: number) {
    const ifCurrent = (action: () => void) => {
      if (gen !== generation) return
      action()
    }

    instance.onaudiostart = () => ifCurrent(() => pokeWatchdog())
    instance.onsoundstart = () => ifCurrent(() => pokeWatchdog())

    instance.onresult = event => ifCurrent(() => {
      pokeWatchdog()
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index]
        if (!result?.isFinal) continue
        const transcript = result[0]?.transcript.trim()
        if (transcript) onResult(transcript)
      }
    })

    instance.onerror = event => ifCurrent(() => {
      if (event.error === 'not-allowed') {
        wanted = false
        clearTimers()
        onListeningChange(false)
        onError('Microphone permission denied')
        return
      }

      if (SOFT_RESTART_ERRORS.has(event.error)) {
        scheduleRestart()
        return
      }

      onError(event.error)
    })

    instance.onend = () => ifCurrent(() => {
      if (wanted) {
        scheduleRestart()
        return
      }

      onListeningChange(false)
    })
  }

  function recreateAndStart() {
    generation++
    const gen = generation
    clearTimers()
    killRecognition()

    const instance = createRecognition()
    bind(instance, gen)
    recognition = instance
    startRecognition(instance)
    pokeWatchdog()
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible' || !wanted) return
    recreateAndStart()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)

  return {
    get lang() {
      return currentLang
    },
    get listening() {
      return wanted
    },
    setLang: (next) => {
      if (currentLang === next) return
      currentLang = next
      if (!wanted) return
      recreateAndStart()
    },
    start: () => {
      wanted = true
      onListeningChange(true)
      recreateAndStart()
    },
    stop: () => {
      wanted = false
      generation++
      clearTimers()
      killRecognition()
      onListeningChange(false)
    },
  }
}
