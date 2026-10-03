export type UiLang = 'en' | 'ru'

export type VoiceCommand
  = | 'like'
    | 'next'
    | 'pause'
    | 'play'
    | 'prev'
    | 'repeatOff'
    | 'repeatOne'
    | 'setVolume'
    | 'volumeDown'
    | 'volumeUp'

export type ParsedCommand
  = | { type: Exclude<VoiceCommand, 'setVolume'> }
    | { type: 'setVolume', level: number }

export const COMMAND_LABELS: Record<UiLang, Record<Exclude<VoiceCommand, 'setVolume'>, string>> = {
  en: {
    like: 'Like',
    next: 'Next track',
    pause: 'Pause',
    play: 'Play',
    prev: 'Previous track',
    repeatOff: 'Repeat off',
    repeatOne: 'Repeat track',
    volumeDown: 'Volume down',
    volumeUp: 'Volume up',
  },
  ru: {
    like: 'Лайк',
    next: 'Следующий трек',
    pause: 'Пауза',
    play: 'Играть',
    prev: 'Предыдущий трек',
    repeatOff: 'Повтор выключен',
    repeatOne: 'Повтор трека',
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
