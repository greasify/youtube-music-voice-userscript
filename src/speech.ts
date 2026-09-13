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
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onend: (() => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onresult: ((event: SpeechResultEvent) => void) | null
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
  const SpeechRecognitionAPI = getSpeechRecognition()
  if (!SpeechRecognitionAPI) {
    throw new Error('SpeechRecognition is not supported')
  }

  const recognition = new SpeechRecognitionAPI()
  recognition.lang = lang
  recognition.continuous = true
  recognition.interimResults = false
  recognition.maxAlternatives = 1

  let wanted = false
  let restartTimer = 0

  const clearRestart = () => {
    window.clearTimeout(restartTimer)
    restartTimer = 0
  }

  const startRecognition = () => {
    try {
      recognition.start()
    } catch {
      // Already running, or start() was called twice.
    }
  }

  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index]
      if (!result?.isFinal) continue
      const transcript = result[0]?.transcript.trim()
      if (transcript) onResult(transcript)
    }
  }

  recognition.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return

    if (event.error === 'not-allowed') {
      wanted = false
      clearRestart()
      onListeningChange(false)
      onError('Microphone permission denied')
      return
    }

    onError(event.error)
  }

  recognition.onend = () => {
    if (!wanted) {
      onListeningChange(false)
      return
    }

    clearRestart()
    restartTimer = window.setTimeout(() => {
      if (!wanted) return
      startRecognition()
    }, 200)
  }

  return {
    get lang() {
      return recognition.lang as SpeechLang
    },
    get listening() {
      return wanted
    },
    setLang: (next) => {
      if (recognition.lang === next) return
      recognition.lang = next
      if (!wanted) return
      clearRestart()
      recognition.stop()
    },
    start: () => {
      wanted = true
      onListeningChange(true)
      startRecognition()
    },
    stop: () => {
      wanted = false
      clearRestart()
      recognition.stop()
      onListeningChange(false)
    },
  }
}
