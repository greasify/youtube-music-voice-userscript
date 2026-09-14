# YouTube Music voice control

English and Russian voice commands on [YouTube Music](https://music.youtube.com) via `SpeechRecognition` (`webkitSpeechRecognition` in Chromium).

> [!WARNING]
> Chrome / Edge only. Firefox has no [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) API.

## Install userscript

> [youtube-music-voice-userscript.user.js](https://greasify.github.io/youtube-music-voice-userscript/youtube-music-voice-userscript.user.js)

## English commands

| Say | Action |
| --- | --- |
| `next`, `skip`, `next track`, `forward` | Next song |
| `previous`, `prev`, `back`, `last track` | Previous song |
| `pause`, `stop` | Pause (no-op if already paused) |
| `play`, `resume`, `start`, `unpause` | Play |
| `volume up`, `louder`, `turn it up` | Volume +10 |
| `volume down`, `quieter`, `turn it down` | Volume -10 |
| `volume 50`, `volume to 80` | Set volume 0–100 |
| `like`, `like this`, `favorite` | Like current track if not liked (unlike by hand only) |

## Russian commands

| Скажи | Действие |
| --- | --- |
| `далее`, `дальше`, `вперёд`, `следующий`, `скип` | Следующий трек |
| `назад`, `верни`, `предыдущий` | Предыдущий трек |
| `пауза`, `паузу`, `стоп`, `останови` | Пауза (если уже на паузе — ничего) |
| `играй`, `включи`, `продолжи`, `поехали` | Play |
| `громче`, `погромче`, `прибавь` | Громкость +10 |
| `тише`, `потише`, `убавь` | Громкость −10 |
| `громкость 32`, `звук 50` | Выставить уровень 0–100 |
| `лайк`, `нравится`, `в избранное` | Лайк, если ещё нет (снять только руками) |
