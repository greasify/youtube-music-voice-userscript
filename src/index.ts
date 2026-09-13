import type { SpeechController, SpeechLang } from './speech'
import { COMMAND_LABELS, parseCommand } from './commands'
import { createHud, mountHud } from './hud'
import { applyCommand } from './player'
import {
  createSpeechController,
  defaultSpeechLang,
  isSpeechSupported,
} from './speech'
import './style.scss'

function uiLang(lang: SpeechLang) {
  return lang === 'ru-RU' ? 'ru' : 'en'
}

function bootstrap() {
  let speech: SpeechController | undefined
  let lang = defaultSpeechLang()

  const hud = createHud({
    lang,
    onLangChange: (next) => {
      lang = next
      hud.setLang(next)
      speech?.setLang(next)
    },
    onToggle: () => {
      if (!speech) return
      if (speech.listening) {
        speech.stop()
        return
      }
      speech.start()
    },
  })

  mountHud(hud.root)

  if (!isSpeechSupported()) {
    hud.setStatus('error')
    hud.showToast(lang === 'ru-RU' ? 'SpeechRecognition не поддерживается' : 'SpeechRecognition is not supported')
    return
  }

  speech = createSpeechController({
    lang,
    onError: (message) => {
      hud.setStatus('error')
      hud.showToast(
        lang === 'ru-RU' && message === 'Microphone permission denied'
          ? 'Нет доступа к микрофону'
          : message,
      )
    },
    onListeningChange: (listening) => {
      hud.setStatus(listening ? 'listening' : 'idle')
    },
    onResult: (transcript) => {
      const labels = COMMAND_LABELS[uiLang(lang)]
      const command = parseCommand(transcript)
      if (!command) {
        hud.showToast(lang === 'ru-RU' ? `Слышу: ${transcript}` : `Heard: ${transcript}`)
        return
      }

      const ok = applyCommand(command)
      const label = labels[command]
      if (ok) {
        hud.showToast(label)
        return
      }
      hud.showToast(lang === 'ru-RU' ? `Не вышло: ${label}` : `Failed: ${label}`)
    },
  })
}

if (document.body) {
  bootstrap()
} else {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true })
}
