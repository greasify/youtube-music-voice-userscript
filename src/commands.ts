export type UiLang = 'en' | 'ru'

export type VoiceCommand
  = | 'next'
    | 'pause'
    | 'play'
    | 'prev'
    | 'setVolume'
    | 'volumeDown'
    | 'volumeUp'

export type ParsedCommand
  = | { type: Exclude<VoiceCommand, 'setVolume'> }
    | { type: 'setVolume', level: number }

const VOLUME_SET_RE = /(?:громкость|звук|volume)\s+(?:на\s+|до\s+|to\s+)?(\d{1,3})\b/

const PHRASES: readonly (readonly [Exclude<VoiceCommand, 'setVolume'>, readonly string[]])[] = [
  ['volumeUp', [
    'увеличить громкость',
    'increase volume',
    'сделай громче',
    'звук громче',
    'громкость вверх',
    'turn it up',
    'volume up',
    'turn up',
    'погромче',
    'прибавь',
    'louder',
    'громче',
  ]],
  ['volumeDown', [
    'уменьшить громкость',
    'decrease volume',
    'сделай тише',
    'звук тише',
    'громкость вниз',
    'turn it down',
    'volume down',
    'turn down',
    'потише',
    'quieter',
    'убавь',
    'тише',
  ]],
  ['next', [
    'следующую песню',
    'следующая песня',
    'следующий трек',
    'next track',
    'skip track',
    'skip song',
    'skip this',
    'next song',
    'next one',
    'пропустить',
    'следующий',
    'скипнуть',
    'пропусти',
    'forward',
    'вперёд',
    'вперед',
    'скипни',
    'дальше',
    'далее',
    'некст',
    'skip',
    'next',
    'скип',
  ]],
  ['prev', [
    'предыдущую песню',
    'предыдущий трек',
    'previous track',
    'previous song',
    'прошлый трек',
    'last track',
    'верни трек',
    'предыдущий',
    'previous',
    'go back',
    'вернись',
    'верни',
    'prev',
    'back',
    'назад',
  ]],
  ['pause', [
    'поставить на паузу',
    'поставь на паузу',
    'на паузу',
    'остановить',
    'остановись',
    'останови',
    'pause',
    'паузу',
    'пауза',
    'хватит',
    'стопни',
    'замри',
    'stop',
    'стоп',
  ]],
  ['play', [
    'продолжи воспроизведение',
    'продолжить',
    'воспроизведи',
    'продолжи',
    'запустить',
    'unpause',
    'запусти',
    'поехали',
    'включи',
    'resume',
    'играй',
    'start',
    'старт',
    'play',
    'плей',
  ]],
]

export const COMMAND_LABELS: Record<UiLang, Record<Exclude<VoiceCommand, 'setVolume'>, string>> = {
  en: {
    next: 'Next track',
    pause: 'Pause',
    play: 'Play',
    prev: 'Previous track',
    volumeDown: 'Volume down',
    volumeUp: 'Volume up',
  },
  ru: {
    next: 'Следующий трек',
    pause: 'Пауза',
    play: 'Играть',
    prev: 'Предыдущий трек',
    volumeDown: 'Тише',
    volumeUp: 'Громче',
  },
}

export function commandLabel(lang: UiLang, command: ParsedCommand) {
  if (command.type === 'setVolume') {
    return lang === 'ru' ? `Громкость ${command.level}` : `Volume ${command.level}`
  }

  return COMMAND_LABELS[lang][command.type]
}

function normalize(transcript: string) {
  return transcript
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesPhrase(text: string, phrase: string) {
  return text === phrase || ` ${text} `.includes(` ${phrase} `)
}

function parseSetVolume(normalized: string): ParsedCommand | null {
  const match = normalized.match(VOLUME_SET_RE)
  if (!match) return null

  const level = Math.min(100, Math.max(0, Math.round(Number(match[1]))))
  return { type: 'setVolume', level }
}

export function parseCommand(transcript: string): ParsedCommand | null {
  const normalized = normalize(transcript)
  if (!normalized) return null

  const setVolume = parseSetVolume(normalized)
  if (setVolume) return setVolume

  for (const [command, phrases] of PHRASES) {
    if (phrases.some(phrase => includesPhrase(normalized, phrase))) {
      return { type: command }
    }
  }

  return null
}
