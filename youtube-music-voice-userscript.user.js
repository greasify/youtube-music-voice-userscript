// ==UserScript==
// @name        youtube-music-voice-userscript
// @version     0.0.0
// @description Voice control for YouTube Music: next, previous, pause, play, volume.
// @match       https://music.youtube.com/*
// @noframes    
// ==/UserScript==

(function (css) {
  var style = document.createElement('style')
  style.textContent = css
  ;(document.head || document.documentElement).appendChild(style)
})(".ymv-root {\n  display: flex;\n  position: relative;\n  flex: 0 0 auto;\n  flex-direction: column;\n  align-items: flex-start;\n  z-index: 3;\n  margin-inline: 0 8px;\n  pointer-events: none;\n  font-family: 'YouTube Sans', Roboto, sans-serif;\n}\n\n.ymv-root .ymv-row {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  pointer-events: auto;\n}\n\n.ymv-root .ymv-mic,\n.ymv-root .ymv-lang {\n  all: unset;\n  display: inline-flex;\n  justify-content: center;\n  align-items: center;\n  cursor: pointer;\n  box-sizing: border-box;\n  background: #212121;\n  color: #fff;\n  font-weight: 600;\n  line-height: 1;\n  font-family: inherit;\n  letter-spacing: 0.02em;\n}\n\n.ymv-root .ymv-mic {\n  border-radius: 18px;\n  padding: 0 12px;\n  min-width: 88px;\n  height: 36px;\n  font-size: 13px;\n}\n\n.ymv-root .ymv-lang {\n  border-radius: 18px;\n  padding: 0 8px;\n  min-width: 36px;\n  height: 36px;\n  font-size: 12px;\n}\n\n.ymv-root .ymv-lang:hover,\n.ymv-root .ymv-mic:hover {\n  background: #303030;\n}\n\n.ymv-root .ymv-lang[aria-pressed='true'] {\n  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 35%);\n  background: #3d3d3d;\n}\n\n.ymv-root[data-status='listening'] .ymv-mic {\n  animation: ymv-pulse 1.6s ease-in-out infinite;\n  background: #f00;\n}\n\n.ymv-root[data-status='error'] .ymv-mic {\n  background: #8b1e1e;\n}\n\n.ymv-root .ymv-toast {\n  position: absolute;\n  top: calc(100% + 6px);\n  left: 0;\n  transform: translateY(4px);\n  opacity: 0;\n  transition:\n    opacity 0.2s ease,\n    transform 0.2s ease;\n  border-radius: 8px;\n  background: rgb(33 33 33 / 92%);\n  padding: 8px 12px;\n  max-width: 240px;\n  pointer-events: none;\n  color: #fff;\n  font-size: 13px;\n  line-height: 1.3;\n  white-space: nowrap;\n}\n\n.ymv-root .ymv-toast[data-visible='true'] {\n  transform: translateY(0);\n  opacity: 1;\n}\n\n@keyframes ymv-pulse {\n  50% {\n    box-shadow: 0 0 0 6px rgb(255 0 0 / 25%);\n  }\n}\n");
(function () {
//#region src/commands.ts
var PHRASES = [
	["volumeUp", [
		"увеличить громкость",
		"increase volume",
		"сделай громче",
		"звук громче",
		"громкость вверх",
		"turn it up",
		"volume up",
		"turn up",
		"погромче",
		"прибавь",
		"louder",
		"громче"
	]],
	["volumeDown", [
		"уменьшить громкость",
		"decrease volume",
		"сделай тише",
		"звук тише",
		"громкость вниз",
		"turn it down",
		"volume down",
		"turn down",
		"потише",
		"quieter",
		"убавь",
		"тише"
	]],
	["next", [
		"следующую песню",
		"следующая песня",
		"следующий трек",
		"next track",
		"skip track",
		"skip song",
		"skip this",
		"next song",
		"next one",
		"пропустить",
		"следующий",
		"скипнуть",
		"пропусти",
		"forward",
		"вперёд",
		"вперед",
		"скипни",
		"дальше",
		"далее",
		"некст",
		"skip",
		"next",
		"скип"
	]],
	["prev", [
		"предыдущую песню",
		"предыдущий трек",
		"previous track",
		"previous song",
		"прошлый трек",
		"last track",
		"верни трек",
		"предыдущий",
		"previous",
		"go back",
		"вернись",
		"верни",
		"prev",
		"back",
		"назад"
	]],
	["pause", [
		"поставить на паузу",
		"поставь на паузу",
		"на паузу",
		"остановить",
		"остановись",
		"останови",
		"pause",
		"паузу",
		"пауза",
		"хватит",
		"стопни",
		"замри",
		"stop",
		"стоп"
	]],
	["play", [
		"продолжи воспроизведение",
		"продолжить",
		"воспроизведи",
		"продолжи",
		"запустить",
		"unpause",
		"запусти",
		"поехали",
		"включи",
		"resume",
		"играй",
		"start",
		"старт",
		"play",
		"плей"
	]]
];
var COMMAND_LABELS = {
	en: {
		next: "Next track",
		pause: "Pause",
		play: "Play",
		prev: "Previous track",
		volumeDown: "Volume down",
		volumeUp: "Volume up"
	},
	ru: {
		next: "Следующий трек",
		pause: "Пауза",
		play: "Играть",
		prev: "Предыдущий трек",
		volumeDown: "Тише",
		volumeUp: "Громче"
	}
};
function normalize(transcript) {
	return transcript.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function includesPhrase(text, phrase) {
	return text === phrase || ` ${text} `.includes(` ${phrase} `);
}
function parseCommand(transcript) {
	const normalized = normalize(transcript);
	if (!normalized) return null;
	for (const [command, phrases] of PHRASES) if (phrases.some((phrase) => includesPhrase(normalized, phrase))) return command;
	return null;
}
//#endregion
//#region src/hud.ts
var STATUS_LABEL = {
	"en-US": {
		error: "Mic error",
		idle: "Voice",
		listening: "Listening"
	},
	"ru-RU": {
		error: "Ошибка",
		idle: "Голос",
		listening: "Слушаю"
	}
};
var TOGGLE_LABEL = {
	"en-US": "Toggle voice control",
	"ru-RU": "Голосовое управление"
};
function createHud({ lang, onLangChange, onToggle }) {
	let currentLang = lang;
	let currentStatus = "idle";
	const root = document.createElement("div");
	root.className = "ymv-root";
	const row = document.createElement("div");
	row.className = "ymv-row";
	const button = document.createElement("button");
	button.type = "button";
	button.className = "ymv-mic";
	const langEn = document.createElement("button");
	langEn.type = "button";
	langEn.className = "ymv-lang";
	langEn.dataset.lang = "en-US";
	langEn.textContent = "EN";
	langEn.setAttribute("aria-label", "English");
	const langRu = document.createElement("button");
	langRu.type = "button";
	langRu.className = "ymv-lang";
	langRu.dataset.lang = "ru-RU";
	langRu.textContent = "RU";
	langRu.setAttribute("aria-label", "Русский");
	const toast = document.createElement("div");
	toast.className = "ymv-toast";
	toast.setAttribute("aria-live", "polite");
	button.addEventListener("click", onToggle);
	langEn.addEventListener("click", () => onLangChange("en-US"));
	langRu.addEventListener("click", () => onLangChange("ru-RU"));
	row.append(button, langEn, langRu);
	root.append(row, toast);
	let toastTimer = 0;
	const render = () => {
		root.dataset.lang = currentLang;
		button.textContent = STATUS_LABEL[currentLang][currentStatus];
		button.setAttribute("aria-label", TOGGLE_LABEL[currentLang]);
		button.setAttribute("aria-pressed", currentStatus === "listening" ? "true" : "false");
		langEn.setAttribute("aria-pressed", currentLang === "en-US" ? "true" : "false");
		langRu.setAttribute("aria-pressed", currentLang === "ru-RU" ? "true" : "false");
	};
	const setStatus = (status) => {
		currentStatus = status;
		root.dataset.status = status;
		render();
	};
	const setLang = (next) => {
		currentLang = next;
		render();
	};
	const showToast = (text) => {
		toast.textContent = text;
		toast.dataset.visible = "true";
		window.clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => {
			toast.dataset.visible = "false";
		}, 1800);
	};
	setStatus("idle");
	return {
		root,
		setLang,
		setStatus,
		showToast
	};
}
function mountHud(node) {
	const attach = () => {
		const right = document.querySelector("#right-content");
		if (right) {
			if (right.firstElementChild !== node) right.prepend(node);
			return;
		}
		const host = document.querySelector("ytmusic-app") ?? document.body;
		if (host && !host.contains(node)) host.append(node);
	};
	attach();
	new MutationObserver(() => {
		const right = document.querySelector("#right-content");
		const inHeader = Boolean(right && right.firstElementChild === node);
		if (!node.isConnected || right && !inHeader) attach();
	}).observe(document.documentElement, {
		childList: true,
		subtree: true
	});
}
//#endregion
//#region src/player.ts
var PLAYER_BAR = "ytmusic-player-bar";
var VOLUME_STEP = 10;
function selectPlayerBar() {
	return document.querySelector(PLAYER_BAR);
}
function selectVideo() {
	return document.querySelector("ytmusic-player video") ?? document.querySelector("video");
}
function selectVolumeSlider() {
	const bar = selectPlayerBar();
	return bar?.querySelector("tp-yt-paper-slider#volume-slider") ?? bar?.querySelector("#volume-slider") ?? bar?.querySelector("tp-yt-paper-slider.volume-slider") ?? document.querySelector("tp-yt-paper-slider#volume-slider");
}
function clickHost(el) {
	((el.tagName === "YT-ICON-BUTTON" ? el.querySelector("button") : null) ?? el).click();
}
function clickFirst(selectors) {
	const scopes = [];
	const bar = selectPlayerBar();
	if (bar) scopes.push(bar);
	scopes.push(document);
	for (const scope of scopes) for (const selector of selectors) {
		const el = scope.querySelector(selector);
		if (!el) continue;
		clickHost(el);
		return true;
	}
	return false;
}
function playPauseButton() {
	return selectPlayerBar()?.querySelector("#play-pause-button") ?? document.querySelector("#play-pause-button");
}
function playPauseLabel() {
	const button = playPauseButton();
	return (button?.getAttribute("title") ?? button?.querySelector("button")?.getAttribute("aria-label") ?? button?.getAttribute("aria-label") ?? "").toLowerCase();
}
function isPaused() {
	const label = playPauseLabel();
	if (/pause|пауза/.test(label)) return false;
	if (/play|воспроизвести/.test(label)) return true;
	return ![...document.querySelectorAll("video")].some((video) => !video.paused && !video.ended);
}
function clickPlayPause() {
	return clickFirst(["#play-pause-button button", "#play-pause-button"]);
}
function play() {
	if (!isPaused()) return true;
	return clickPlayPause();
}
function pause() {
	if (isPaused()) return true;
	const playing = [...document.querySelectorAll("video")].filter((video) => !video.paused && !video.ended);
	const clicked = clickPlayPause();
	for (const video of playing) video.pause();
	return clicked || playing.length > 0;
}
function readSliderValue(slider) {
	const fromProp = Number(slider.value);
	if (Number.isFinite(fromProp)) return fromProp;
	const fromAttr = Number(slider.getAttribute("aria-valuenow") ?? slider.getAttribute("value"));
	return Number.isFinite(fromAttr) ? fromAttr : 50;
}
function adjustVolume(delta) {
	const slider = selectVolumeSlider();
	const video = selectVideo();
	if (slider) {
		const next = Math.min(100, Math.max(0, readSliderValue(slider) + delta));
		slider.value = next;
		slider.setAttribute("value", String(next));
		slider.setAttribute("aria-valuenow", String(next));
		slider.dispatchEvent(new Event("immediate-value-change", { bubbles: true }));
		slider.dispatchEvent(new Event("change", { bubbles: true }));
		return true;
	}
	if (!video) return false;
	video.volume = Math.min(1, Math.max(0, video.volume + delta / 100));
	if (video.volume > 0) video.muted = false;
	return true;
}
function applyCommand(command) {
	switch (command) {
		case "next": return clickFirst([
			".next-button",
			"[aria-label=\"Next\"]",
			"[title=\"Next\"]"
		]);
		case "pause": return pause();
		case "play": return play();
		case "prev": return clickFirst([
			".previous-button",
			"[aria-label=\"Previous\"]",
			"[title=\"Previous\"]"
		]);
		case "volumeDown": return adjustVolume(-10);
		case "volumeUp": return adjustVolume(VOLUME_STEP);
	}
}
//#endregion
//#region src/speech.ts
function defaultSpeechLang() {
	return navigator.language.toLowerCase().startsWith("ru") ? "ru-RU" : "en-US";
}
function getSpeechRecognition() {
	const view = window;
	return view.SpeechRecognition ?? view.webkitSpeechRecognition;
}
var isSpeechSupported = () => Boolean(getSpeechRecognition());
function createSpeechController({ lang = defaultSpeechLang(), onError, onListeningChange, onResult }) {
	const SpeechRecognitionAPI = getSpeechRecognition();
	if (!SpeechRecognitionAPI) throw new Error("SpeechRecognition is not supported");
	const recognition = new SpeechRecognitionAPI();
	recognition.lang = lang;
	recognition.continuous = true;
	recognition.interimResults = false;
	recognition.maxAlternatives = 1;
	let wanted = false;
	let restartTimer = 0;
	const clearRestart = () => {
		window.clearTimeout(restartTimer);
		restartTimer = 0;
	};
	const startRecognition = () => {
		try {
			recognition.start();
		} catch {}
	};
	recognition.onresult = (event) => {
		for (let index = event.resultIndex; index < event.results.length; index++) {
			const result = event.results[index];
			if (!result?.isFinal) continue;
			const transcript = result[0]?.transcript.trim();
			if (transcript) onResult(transcript);
		}
	};
	recognition.onerror = (event) => {
		if (event.error === "no-speech" || event.error === "aborted") return;
		if (event.error === "not-allowed") {
			wanted = false;
			clearRestart();
			onListeningChange(false);
			onError("Microphone permission denied");
			return;
		}
		onError(event.error);
	};
	recognition.onend = () => {
		if (!wanted) {
			onListeningChange(false);
			return;
		}
		clearRestart();
		restartTimer = window.setTimeout(() => {
			if (!wanted) return;
			startRecognition();
		}, 200);
	};
	return {
		get lang() {
			return recognition.lang;
		},
		get listening() {
			return wanted;
		},
		setLang: (next) => {
			if (recognition.lang === next) return;
			recognition.lang = next;
			if (!wanted) return;
			clearRestart();
			recognition.stop();
		},
		start: () => {
			wanted = true;
			onListeningChange(true);
			startRecognition();
		},
		stop: () => {
			wanted = false;
			clearRestart();
			recognition.stop();
			onListeningChange(false);
		}
	};
}
//#endregion
//#region src/index.ts
function uiLang(lang) {
	return lang === "ru-RU" ? "ru" : "en";
}
function bootstrap() {
	let speech;
	let lang = defaultSpeechLang();
	const hud = createHud({
		lang,
		onLangChange: (next) => {
			lang = next;
			hud.setLang(next);
			speech?.setLang(next);
		},
		onToggle: () => {
			if (!speech) return;
			if (speech.listening) {
				speech.stop();
				return;
			}
			speech.start();
		}
	});
	mountHud(hud.root);
	if (!isSpeechSupported()) {
		hud.setStatus("error");
		hud.showToast(lang === "ru-RU" ? "SpeechRecognition не поддерживается" : "SpeechRecognition is not supported");
		return;
	}
	speech = createSpeechController({
		lang,
		onError: (message) => {
			hud.setStatus("error");
			hud.showToast(lang === "ru-RU" && message === "Microphone permission denied" ? "Нет доступа к микрофону" : message);
		},
		onListeningChange: (listening) => {
			hud.setStatus(listening ? "listening" : "idle");
		},
		onResult: (transcript) => {
			const labels = COMMAND_LABELS[uiLang(lang)];
			const command = parseCommand(transcript);
			if (!command) {
				hud.showToast(lang === "ru-RU" ? `Слышу: ${transcript}` : `Heard: ${transcript}`);
				return;
			}
			const ok = applyCommand(command);
			const label = labels[command];
			if (ok) {
				hud.showToast(label);
				return;
			}
			hud.showToast(lang === "ru-RU" ? `Не вышло: ${label}` : `Failed: ${label}`);
		}
	});
}
if (document.body) bootstrap();
else document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
//#endregion

})();
