export type HudStatus = 'connected' | 'disconnected'

export type Hud = {
  root: HTMLElement
  setStatus: (status: HudStatus) => void
  showToast: (text: string) => void
}

type HudLang = 'en' | 'ru'

const STATUS_LABEL: Record<HudLang, Record<HudStatus, string>> = {
  en: {
    connected: 'Voice',
    disconnected: 'No service',
  },
  ru: {
    connected: 'Голос',
    disconnected: 'Нет сервиса',
  },
}

export function createHud(): Hud {
  const lang: HudLang = navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'
  let currentStatus: HudStatus = 'disconnected'

  const root = document.createElement('div')
  root.className = 'ymv-root'

  const status = document.createElement('div')
  status.className = 'ymv-status'

  const toast = document.createElement('div')
  toast.className = 'ymv-toast'
  toast.setAttribute('aria-live', 'polite')

  root.append(status, toast)

  let toastTimer = 0

  const render = () => {
    root.dataset.status = currentStatus
    status.textContent = STATUS_LABEL[lang][currentStatus]
  }

  const setStatus = (next: HudStatus) => {
    currentStatus = next
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

  render()

  return { root, setStatus, showToast }
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
