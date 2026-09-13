import type { SpeechLang } from './speech'

export type HudStatus = 'error' | 'idle' | 'listening'

export type Hud = {
  root: HTMLElement
  setLang: (lang: SpeechLang) => void
  setStatus: (status: HudStatus) => void
  showToast: (text: string) => void
}

export type HudOptions = {
  lang: SpeechLang
  onLangChange: (lang: SpeechLang) => void
  onToggle: () => void
}

const STATUS_LABEL: Record<SpeechLang, Record<HudStatus, string>> = {
  'en-US': {
    error: 'Mic error',
    idle: 'Voice',
    listening: 'Listening',
  },
  'ru-RU': {
    error: 'Ошибка',
    idle: 'Голос',
    listening: 'Слушаю',
  },
}

const TOGGLE_LABEL: Record<SpeechLang, string> = {
  'en-US': 'Toggle voice control',
  'ru-RU': 'Голосовое управление',
}

export function createHud({ lang, onLangChange, onToggle }: HudOptions): Hud {
  let currentLang = lang
  let currentStatus: HudStatus = 'idle'

  const root = document.createElement('div')
  root.className = 'ymv-root'

  const row = document.createElement('div')
  row.className = 'ymv-row'

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ymv-mic'

  const langEn = document.createElement('button')
  langEn.type = 'button'
  langEn.className = 'ymv-lang'
  langEn.dataset.lang = 'en-US'
  langEn.textContent = 'EN'
  langEn.setAttribute('aria-label', 'English')

  const langRu = document.createElement('button')
  langRu.type = 'button'
  langRu.className = 'ymv-lang'
  langRu.dataset.lang = 'ru-RU'
  langRu.textContent = 'RU'
  langRu.setAttribute('aria-label', 'Русский')

  const toast = document.createElement('div')
  toast.className = 'ymv-toast'
  toast.setAttribute('aria-live', 'polite')

  button.addEventListener('click', onToggle)
  langEn.addEventListener('click', () => onLangChange('en-US'))
  langRu.addEventListener('click', () => onLangChange('ru-RU'))

  row.append(button, langEn, langRu)
  root.append(row, toast)

  let toastTimer = 0

  const render = () => {
    root.dataset.lang = currentLang
    button.textContent = STATUS_LABEL[currentLang][currentStatus]
    button.setAttribute('aria-label', TOGGLE_LABEL[currentLang])
    button.setAttribute('aria-pressed', currentStatus === 'listening' ? 'true' : 'false')
    langEn.setAttribute('aria-pressed', currentLang === 'en-US' ? 'true' : 'false')
    langRu.setAttribute('aria-pressed', currentLang === 'ru-RU' ? 'true' : 'false')
  }

  const setStatus = (status: HudStatus) => {
    currentStatus = status
    root.dataset.status = status
    render()
  }

  const setLang = (next: SpeechLang) => {
    currentLang = next
    render()
  }

  const showToast = (text: string) => {
    toast.textContent = text
    toast.dataset.visible = 'true'
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      toast.dataset.visible = 'false'
    }, 1800)
  }

  setStatus('idle')

  return { root, setLang, setStatus, showToast }
}

export function mountHud(node: HTMLElement) {
  const attach = () => {
    const right = document.querySelector('#right-content')
    if (right) {
      if (right.firstElementChild !== node) right.prepend(node)
      return
    }

    const host = document.querySelector('ytmusic-app') ?? document.body
    if (host && !host.contains(node)) host.append(node)
  }

  attach()

  const observer = new MutationObserver(() => {
    const right = document.querySelector('#right-content')
    const inHeader = Boolean(right && right.firstElementChild === node)
    if (!node.isConnected || (right && !inHeader)) attach()
  })

  observer.observe(document.documentElement, { childList: true, subtree: true })
}
