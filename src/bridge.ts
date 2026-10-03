import type { VoiceCommand } from './commands'

export const VOICE_SERVICE_ORIGIN = 'http://127.0.0.1:47631'

const WAIT_TIMEOUT_MS = 25_000
const RETRY_MIN_MS = 400
const RETRY_MAX_MS = 3_000

const COMMAND_NAMES: readonly VoiceCommand[] = [
  'like',
  'next',
  'pause',
  'play',
  'prev',
  'repeatOff',
  'repeatOne',
  'setVolume',
  'volumeDown',
  'volumeUp',
]

export type BridgeSession = {
  hasPlayer: boolean
  href: string
  playing: boolean
  visibility: 'hidden' | 'visible'
}

export type RemoteCommand = {
  confidence: number
  id: string
  level?: number
  name: VoiceCommand
  transcript: string
}

export type CommandResult = {
  already?: boolean
  ok: boolean
}

export type CommandBridge = {
  start: () => void
  stop: () => void
  update: (session: BridgeSession) => void
}

export type BridgeOptions = {
  onCommand: (command: RemoteCommand) => CommandResult | Promise<CommandResult>
  onStatus: (connected: boolean) => void
  session: () => BridgeSession
}

type GmResult = {
  responseText: string
  status: number
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function isVoiceCommand(value: string): value is VoiceCommand {
  return COMMAND_NAMES.includes(value as VoiceCommand)
}

function gm(details: Tampermonkey.Request) {
  return new Promise<GmResult>((resolve, reject) => {
    GM_xmlhttpRequest({
      anonymous: true,
      data: details.data,
      headers: details.headers,
      method: details.method,
      timeout: details.timeout,
      url: details.url,
      onabort: () => reject(new Error('aborted')),
      onerror: () => reject(new Error('request failed')),
      onload: response => resolve({
        responseText: response.responseText,
        status: response.status,
      }),
      ontimeout: () => reject(new Error('timeout')),
    })
  })
}

function parseCommand(raw: string): RemoteCommand | null {
  if (!raw || raw === '{}') return null

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }

  if (!data || typeof data !== 'object') return null

  const record = data as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null
  if (!isVoiceCommand(record.name)) return null
  if (record.name === 'setVolume' && typeof record.level !== 'number') return null

  const command: RemoteCommand = {
    confidence: typeof record.confidence === 'number' ? record.confidence : 1,
    id: record.id,
    name: record.name,
    transcript: typeof record.transcript === 'string' ? record.transcript : '',
  }

  if (typeof record.level === 'number') command.level = record.level
  return command
}

export function createCommandBridge({ onCommand, onStatus, session }: BridgeOptions): CommandBridge {
  let backoff = RETRY_MIN_MS
  let clientId = ''
  let running = false

  const postSession = async (currentId: string) => {
    const body = session()
    const response = await gm({
      data: JSON.stringify({
        clientId: currentId || undefined,
        hasPlayer: body.hasPlayer,
        href: body.href,
        playing: body.playing,
        visibility: body.visibility,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      timeout: 5_000,
      url: `${VOICE_SERVICE_ORIGIN}/v1/session`,
    })

    if (response.status !== 200) throw new Error(`session ${response.status}`)

    const payload = JSON.parse(response.responseText) as { clientId?: string }
    if (!payload.clientId) throw new Error('session missing clientId')
    return payload.clientId
  }

  const waitForCommand = async (currentId: string) => {
    const response = await gm({
      method: 'GET',
      timeout: WAIT_TIMEOUT_MS,
      url: `${VOICE_SERVICE_ORIGIN}/v1/wait?clientId=${encodeURIComponent(currentId)}`,
    })

    if (response.status === 404) {
      clientId = ''
      throw new Error('session lost')
    }

    if (response.status !== 200) throw new Error(`wait ${response.status}`)
    return parseCommand(response.responseText)
  }

  const postResult = async (currentId: string, command: RemoteCommand, result: CommandResult) => {
    await gm({
      data: JSON.stringify({
        already: Boolean(result.already),
        clientId: currentId,
        id: command.id,
        ok: result.ok,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      timeout: 5_000,
      url: `${VOICE_SERVICE_ORIGIN}/v1/result`,
    })
  }

  const loop = async () => {
    if (!running) return

    try {
      clientId = await postSession(clientId)
      const command = await waitForCommand(clientId)
      if (!running) return

      onStatus(true)
      backoff = RETRY_MIN_MS

      if (command) {
        const result = await onCommand(command)
        try {
          await postResult(clientId, command, result)
        } catch {
          // The player already ran the command. Keep the session.
        }
      }
    } catch {
      if (!running) return
      onStatus(false)
      clientId = ''
      await delay(backoff)
      backoff = Math.min(backoff * 2, RETRY_MAX_MS)
    }

    if (running) void loop()
  }

  return {
    start: () => {
      if (running) return
      running = true
      void loop()
    },
    stop: () => {
      running = false
    },
    update: (next) => {
      if (!running || !clientId) return
      const currentId = clientId
      void gm({
        data: JSON.stringify({
          clientId: currentId,
          hasPlayer: next.hasPlayer,
          href: next.href,
          playing: next.playing,
          visibility: next.visibility,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        timeout: 5_000,
        url: `${VOICE_SERVICE_ORIGIN}/v1/session`,
      }).then((response) => {
        if (!running || clientId !== currentId || response.status !== 200) return
        const payload = JSON.parse(response.responseText) as { clientId?: string }
        if (payload.clientId) clientId = payload.clientId
      }).catch(() => {})
    },
  }
}
