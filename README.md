# YouTube Music voice control

A macOS menu bar app hears the microphone and decides the command. The userscript on [YouTube Music](https://music.youtube.com) only runs that command. It does not listen and it does not match phrases.

The app binds `http://127.0.0.1:47631` and does not send CORS headers, so a normal page cannot call it. The userscript reaches it through `GM_xmlhttpRequest`. The same HTTP contract is what a future Windows tray app would implement.

## macOS app

macOS 14 or newer.

```bash
./macos/package-app.sh
open macos/YouTubeMusicVoice.app
```

On first launch, allow the microphone and speech recognition. Listening is on by default. Russian and English are separate recognizers, so pick the language in the menu bar. Launch at login stays off until you enable it.

If YouTube Music is closed, saying `play music` or `включи музыку` opens the site and runs the command once the page loads. The userscript must already be installed, and the userscript manager must allow `@connect 127.0.0.1`.

The page shows a green **Voice** / **Голос** pill while the app is reachable, and **No service** / **Нет сервиса** when it is not.

## Install userscript

> [youtube-music-voice-userscript.user.js](https://greasify.github.io/youtube-music-voice-userscript/youtube-music-voice-userscript.user.js)

## English commands

| Say | Action |
| --- | --- |
| `next`, `skip`, `next track`, `forward` | Next song |
| `previous`, `prev`, `back`, `last track` | Previous song |
| `pause`, `stop` | Pause (no-op if already paused) |
| `play`, `resume`, `start`, `unpause`, `play music` | Play. Opens YouTube Music if the tab is gone |
| `volume up`, `louder`, `turn it up` | Volume +10 |
| `volume down`, `quieter`, `turn it down` | Volume -10 |
| `volume 50`, `volume to 80` | Set volume 0–100 |
| `like`, `like this`, `favorite` | Like current track if not liked (unlike by hand only) |
| `repeat one`, `repeat track`, `loop` | Repeat the current track (no-op if already on) |
| `repeat off`, `turn repeat off`, `stop repeat` | Turn repeat off (no-op if already off) |

## Russian commands

| Скажи | Действие |
| --- | --- |
| `далее`, `дальше`, `вперёд`, `следующий`, `скип` | Следующий трек |
| `назад`, `верни`, `предыдущий` | Предыдущий трек |
| `пауза`, `паузу`, `стоп`, `останови` | Пауза (если уже на паузе — ничего) |
| `играй`, `включи`, `включи музыку`, `продолжи`, `поехали` | Play. Если вкладки нет, приложение её откроет |
| `громче`, `погромче`, `прибавь` | Громкость +10 |
| `тише`, `потише`, `убавь` | Громкость −10 |
| `громкость 32`, `звук 50` | Выставить уровень 0–100 |
| `лайк`, `нравится`, `в избранное` | Лайк, если ещё нет (снять только руками) |
| `поставь трек на репит`, `повтор`, `зацикли` | Повтор текущего трека (если уже включён — ничего) |
| `выключи повтор`, `отключи репит`, `без повтора` | Выключить повтор (если уже выключен — ничего) |
