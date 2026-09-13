# YouTube Music voice control

English and Russian voice commands on [YouTube Music](https://music.youtube.com) via `SpeechRecognition` (`webkitSpeechRecognition` in Chromium).

> **Warn**\
> Chrome / Edge only. Firefox has no [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) API API.

`SpeechRecognition` uses one acoustic model at a time. The HUD `EN` / `RU` switch sets `en-US` or `ru-RU` and restarts the session if the mic is already on. Default follows `navigator.language` (`ru*` → `ru-RU`).

```bash
pnpm dev
pnpm build
```

Install the printed **Userscript** URL (`*.user.js`). Open `https://music.youtube.com`, click **Voice** / **Голос**, allow the microphone.

## English commands

| Say | Action |
| --- | --- |
| `next`, `skip`, `next track`, `forward` | Next song |
| `previous`, `prev`, `back`, `last track` | Previous song |
| `pause`, `stop` | Pause (no-op if already paused) |
| `play`, `resume`, `start`, `unpause` | Play |
| `volume up`, `louder`, `turn it up` | Volume +10 |
| `volume down`, `quieter`, `turn it down` | Volume -10 |

## Russian commands

| Скажи | Действие |
| --- | --- |
| `далее`, `дальше`, `вперёд`, `следующий`, `скип` | Следующий трек |
| `назад`, `верни`, `предыдущий` | Предыдущий трек |
| `пауза`, `паузу`, `стоп`, `останови` | Пауза (если уже на паузе — ничего) |
| `играй`, `включи`, `продолжи`, `поехали` | Play |
| `громче`, `погромче`, `прибавь` | Громкость +10 |
| `тише`, `потише`, `убавь` | Громкость −10 |
