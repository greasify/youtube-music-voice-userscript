import type { BridgeSession, RemoteCommand } from './bridge'
import type { ParsedCommand } from './commands'
import type { ApplyResult } from './player'
import { createCommandBridge } from './bridge'
import { commandLabel } from './commands'
import { playLikeFeedback, playRepeatFeedback, resumeFeedback } from './feedback'
import { createHud, mountHud } from './hud'
import { applyCommand } from './player'
import './style.scss'

const APPLY_ATTEMPTS = 10
const APPLY_GAP_MS = 300

function uiLang() {
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru' as const : 'en' as const
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function readSession(): BridgeSession {
  const video = document.querySelector('video')
  return {
    hasPlayer: Boolean(document.querySelector('ytmusic-player-bar')),
    href: location.href,
    playing: Boolean(video && !video.paused && !video.ended),
    visibility: document.visibilityState === 'visible' ? 'visible' : 'hidden',
  }
}

function toParsed(command: RemoteCommand): ParsedCommand | null {
  if (command.name === 'setVolume') {
    if (typeof command.level !== 'number') return null
    return { type: 'setVolume', level: command.level }
  }

  return { type: command.name }
}

async function applyWithRetry(command: ParsedCommand): Promise<ApplyResult> {
  let result: ApplyResult = { ok: false }

  for (let attempt = 0; attempt < APPLY_ATTEMPTS; attempt++) {
    result = applyCommand(command)
    if (result.ok) return result
    await delay(APPLY_GAP_MS)
  }

  return result
}

function bootstrap() {
  const hud = createHud()
  mountHud(hud.root)

  const unlock = () => {
    resumeFeedback()
    window.removeEventListener('pointerdown', unlock)
  }
  window.addEventListener('pointerdown', unlock)

  const bridge = createCommandBridge({
    onCommand: async (command) => {
      const parsed = toParsed(command)
      const lang = uiLang()
      if (!parsed) {
        hud.showToast(lang === 'ru' ? 'Неизвестная команда' : 'Unknown command')
        return { ok: false }
      }

      const result = await applyWithRetry(parsed)
      const label = commandLabel(lang, parsed)

      if (parsed.type === 'like') {
        if (result.ok) {
          playLikeFeedback(Boolean(result.already))
          return result
        }
        hud.showToast(lang === 'ru' ? `Не вышло: ${label}` : `Failed: ${label}`)
        return result
      }

      if (result.ok) {
        if (parsed.type === 'repeatOne' || parsed.type === 'repeatOff') {
          playRepeatFeedback(parsed.type === 'repeatOne', Boolean(result.already))
        }
        hud.showToast(label)
        return result
      }

      hud.showToast(lang === 'ru' ? `Не вышло: ${label}` : `Failed: ${label}`)
      return result
    },
    onStatus: connected => hud.setStatus(connected ? 'connected' : 'disconnected'),
    session: readSession,
  })

  document.addEventListener('visibilitychange', () => {
    bridge.update(readSession())
  })

  bridge.start()
}

if (document.body) bootstrap()
else document.addEventListener('DOMContentLoaded', bootstrap, { once: true })
