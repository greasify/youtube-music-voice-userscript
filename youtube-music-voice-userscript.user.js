// ==UserScript==
// @name        youtube-music-voice-userscript
// @version     0.0.0
// @description Voice control for YouTube Music: next, previous, pause, play, volume.
// @homepage    https://greasify.github.io/youtube-music-voice-userscript/
// @match       https://music.youtube.com/*
// @noframes    
// @updateURL   https://greasify.github.io/youtube-music-voice-userscript/youtube-music-voice-userscript.meta.js
// @downloadURL https://greasify.github.io/youtube-music-voice-userscript/youtube-music-voice-userscript.user.js
// ==/UserScript==

(function (css) {
  var style = document.createElement('style')
  style.textContent = css
  ;(document.head || document.documentElement).appendChild(style)
})(".ymv-root {\n  display: flex;\n  position: relative;\n  flex: 0 0 auto;\n  flex-direction: column;\n  align-items: flex-start;\n  z-index: 3;\n  margin-inline: 0 8px;\n  pointer-events: none;\n  font-family: \"YouTube Sans\", Roboto, sans-serif;\n}\n.ymv-root .ymv-row {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  pointer-events: auto;\n}\n.ymv-root .ymv-mic, .ymv-root .ymv-lang {\n  all: unset;\n  display: inline-flex;\n  justify-content: center;\n  align-items: center;\n  cursor: pointer;\n  box-sizing: border-box;\n  background: #212121;\n  color: #fff;\n  font-weight: 600;\n  line-height: 1;\n  font-family: inherit;\n  letter-spacing: 0.02em;\n}\n.ymv-root .ymv-mic:hover, .ymv-root .ymv-lang:hover {\n  background: #303030;\n}\n.ymv-root .ymv-mic {\n  border-radius: 18px;\n  padding: 0 12px;\n  min-width: 88px;\n  height: 36px;\n  font-size: 13px;\n}\n.ymv-root .ymv-lang {\n  border-radius: 18px;\n  padding: 0 8px;\n  min-width: 36px;\n  height: 36px;\n  font-size: 12px;\n}\n.ymv-root .ymv-lang[aria-pressed=true] {\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);\n  background: #3d3d3d;\n}\n.ymv-root .ymv-toast {\n  position: absolute;\n  top: calc(100% + 6px);\n  left: 0;\n  transform: translateY(4px);\n  opacity: 0;\n  transition: opacity 0.2s ease, transform 0.2s ease;\n  border-radius: 8px;\n  background: rgba(33, 33, 33, 0.92);\n  padding: 8px 12px;\n  max-width: 240px;\n  pointer-events: none;\n  color: #fff;\n  font-size: 13px;\n  line-height: 1.3;\n  white-space: nowrap;\n}\n.ymv-root .ymv-toast[data-visible=true] {\n  transform: translateY(0);\n  opacity: 1;\n}\n.ymv-root[data-status=listening] .ymv-mic {\n  animation: ymv-pulse 1.6s ease-in-out infinite;\n  background: #f00;\n}\n.ymv-root[data-status=error] .ymv-mic {\n  background: #8b1e1e;\n}\n\n@keyframes ymv-pulse {\n  50% {\n    box-shadow: 0 0 0 6px rgba(255, 0, 0, 0.25);\n  }\n}");
(function () {
//#region src/commands.ts
var VOLUME_SET_RE = /(?:громкость|звук|volume)\s+(?:на\s+|до\s+|to\s+)?(\d{1,3})\b/;
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
	["like", [
		"в избранное",
		"в любимое",
		"like this",
		"love this",
		"нравится",
		"favorite",
		"лайкни",
		"heart",
		"лайк",
		"like"
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
		like: "Like",
		next: "Next track",
		pause: "Pause",
		play: "Play",
		prev: "Previous track",
		volumeDown: "Volume down",
		volumeUp: "Volume up"
	},
	ru: {
		like: "Лайк",
		next: "Следующий трек",
		pause: "Пауза",
		play: "Играть",
		prev: "Предыдущий трек",
		volumeDown: "Тише",
		volumeUp: "Громче"
	}
};
function commandLabel(lang, command) {
	if (command.type === "setVolume") return lang === "ru" ? `Громкость ${command.level}` : `Volume ${command.level}`;
	return COMMAND_LABELS[lang][command.type];
}
function normalize(transcript) {
	return transcript.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function includesPhrase(text, phrase) {
	return text === phrase || ` ${text} `.includes(` ${phrase} `);
}
function parseSetVolume(normalized) {
	const match = normalized.match(VOLUME_SET_RE);
	if (!match) return null;
	return {
		type: "setVolume",
		level: Math.min(100, Math.max(0, Math.round(Number(match[1]))))
	};
}
function parseCommand(transcript) {
	const normalized = normalize(transcript);
	if (!normalized) return null;
	const setVolume = parseSetVolume(normalized);
	if (setVolume) return setVolume;
	for (const [command, phrases] of PHRASES) if (phrases.some((phrase) => includesPhrase(normalized, phrase))) return { type: command };
	return null;
}
//#endregion
//#region src/feedback.ts
var SUCCESS_HZ = 880;
var ALREADY_HZ = 440;
var SUCCESS_MS = 80;
var ALREADY_MS = 50;
var context;
function getContext() {
	context ??= new AudioContext();
	return context;
}
function resumeFeedback() {
	getContext().resume();
}
function playTick(frequency, durationMs) {
	const ctx = getContext();
	if (ctx.state === "suspended") return;
	const oscillator = ctx.createOscillator();
	const gain = ctx.createGain();
	const now = ctx.currentTime;
	const end = now + durationMs / 1e3;
	oscillator.type = "sine";
	oscillator.frequency.value = frequency;
	gain.gain.setValueAtTime(.12, now);
	gain.gain.exponentialRampToValueAtTime(.001, end);
	oscillator.connect(gain);
	gain.connect(ctx.destination);
	oscillator.start(now);
	oscillator.stop(end);
}
function playLikeFeedback(already) {
	if (already) {
		playTick(ALREADY_HZ, ALREADY_MS);
		return;
	}
	playTick(SUCCESS_HZ, SUCCESS_MS);
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
function writeVolume(level) {
	const next = Math.min(100, Math.max(0, Math.round(level)));
	const slider = selectVolumeSlider();
	const video = selectVideo();
	if (slider) {
		slider.value = next;
		slider.setAttribute("value", String(next));
		slider.setAttribute("aria-valuenow", String(next));
		slider.dispatchEvent(new Event("immediate-value-change", { bubbles: true }));
		slider.dispatchEvent(new Event("change", { bubbles: true }));
		return true;
	}
	if (!video) return false;
	video.volume = next / 100;
	if (video.volume > 0) video.muted = false;
	return true;
}
function adjustVolume(delta) {
	const slider = selectVolumeSlider();
	if (slider) return writeVolume(readSliderValue(slider) + delta);
	const video = selectVideo();
	if (!video) return false;
	return writeVolume(video.volume * 100 + delta);
}
function selectLikeRenderer() {
	return selectPlayerBar()?.querySelector("ytmusic-like-button-renderer") ?? document.querySelector("ytmusic-like-button-renderer");
}
function isLiked(renderer) {
	return (renderer.getAttribute("like-status") ?? renderer.likeStatus ?? "").toUpperCase() === "LIKE";
}
function like() {
	const renderer = selectLikeRenderer();
	if (!renderer) return { ok: false };
	if (isLiked(renderer)) return {
		already: true,
		ok: true
	};
	const scopes = [renderer];
	const bar = selectPlayerBar();
	if (bar) scopes.push(bar);
	scopes.push(document);
	for (const scope of scopes) for (const selector of [
		"#button-shape-like button",
		"#like-button button",
		"#like-button"
	]) {
		const el = scope.querySelector(selector);
		if (!el) continue;
		clickHost(el);
		return { ok: true };
	}
	return { ok: false };
}
function applyCommand(command) {
	switch (command.type) {
		case "like": return like();
		case "next": return { ok: clickFirst([
			".next-button",
			"[aria-label=\"Next\"]",
			"[title=\"Next\"]"
		]) };
		case "pause": return { ok: pause() };
		case "play": return { ok: play() };
		case "prev": return { ok: clickFirst([
			".previous-button",
			"[aria-label=\"Previous\"]",
			"[title=\"Previous\"]"
		]) };
		case "setVolume": return { ok: writeVolume(command.level) };
		case "volumeDown": return { ok: adjustVolume(-10) };
		case "volumeUp": return { ok: adjustVolume(VOLUME_STEP) };
	}
}
//#endregion
//#region src/speech.ts
var RESTART_DELAY_MS = 200;
var WATCHDOG_MS = 12e3;
var SOFT_RESTART_ERRORS = /* @__PURE__ */ new Set([
	"aborted",
	"network",
	"no-speech"
]);
function defaultSpeechLang() {
	return navigator.language.toLowerCase().startsWith("ru") ? "ru-RU" : "en-US";
}
function getSpeechRecognition() {
	const view = window;
	return view.SpeechRecognition ?? view.webkitSpeechRecognition;
}
var isSpeechSupported = () => Boolean(getSpeechRecognition());
function createSpeechController({ lang = defaultSpeechLang(), onError, onListeningChange, onResult }) {
	const maybeRecognition = getSpeechRecognition();
	if (!maybeRecognition) throw new Error("SpeechRecognition is not supported");
	const SpeechRecognitionAPI = maybeRecognition;
	let currentLang = lang;
	let wanted = false;
	let generation = 0;
	let recognition;
	let restartTimer = 0;
	let watchdogTimer = 0;
	function clearRestart() {
		window.clearTimeout(restartTimer);
		restartTimer = 0;
	}
	function clearWatchdog() {
		window.clearTimeout(watchdogTimer);
		watchdogTimer = 0;
	}
	function clearTimers() {
		clearRestart();
		clearWatchdog();
	}
	function pokeWatchdog() {
		if (!wanted) return;
		clearWatchdog();
		watchdogTimer = window.setTimeout(() => {
			if (!wanted) return;
			recreateAndStart();
		}, WATCHDOG_MS);
	}
	function killRecognition() {
		const dying = recognition;
		recognition = void 0;
		if (!dying) return;
		try {
			if (dying.abort) dying.abort();
			else dying.stop();
		} catch {}
	}
	function createRecognition() {
		const instance = new SpeechRecognitionAPI();
		instance.lang = currentLang;
		instance.continuous = true;
		instance.interimResults = false;
		instance.maxAlternatives = 1;
		return instance;
	}
	function startRecognition(instance) {
		try {
			instance.start();
		} catch {}
	}
	function scheduleRestart() {
		if (!wanted) return;
		clearRestart();
		restartTimer = window.setTimeout(() => {
			if (!wanted) return;
			recreateAndStart();
		}, RESTART_DELAY_MS);
	}
	function bind(instance, gen) {
		const ifCurrent = (action) => {
			if (gen !== generation) return;
			action();
		};
		instance.onaudiostart = () => ifCurrent(() => pokeWatchdog());
		instance.onsoundstart = () => ifCurrent(() => pokeWatchdog());
		instance.onresult = (event) => ifCurrent(() => {
			pokeWatchdog();
			for (let index = event.resultIndex; index < event.results.length; index++) {
				const result = event.results[index];
				if (!result?.isFinal) continue;
				const transcript = result[0]?.transcript.trim();
				if (transcript) onResult(transcript);
			}
		});
		instance.onerror = (event) => ifCurrent(() => {
			if (event.error === "not-allowed") {
				wanted = false;
				clearTimers();
				onListeningChange(false);
				onError("Microphone permission denied");
				return;
			}
			if (SOFT_RESTART_ERRORS.has(event.error)) {
				scheduleRestart();
				return;
			}
			onError(event.error);
		});
		instance.onend = () => ifCurrent(() => {
			if (wanted) {
				scheduleRestart();
				return;
			}
			onListeningChange(false);
		});
	}
	function recreateAndStart() {
		generation++;
		const gen = generation;
		clearTimers();
		killRecognition();
		const instance = createRecognition();
		bind(instance, gen);
		recognition = instance;
		startRecognition(instance);
		pokeWatchdog();
	}
	function onVisibilityChange() {
		if (document.visibilityState !== "visible" || !wanted) return;
		recreateAndStart();
	}
	document.addEventListener("visibilitychange", onVisibilityChange);
	return {
		get lang() {
			return currentLang;
		},
		get listening() {
			return wanted;
		},
		setLang: (next) => {
			if (currentLang === next) return;
			currentLang = next;
			if (!wanted) return;
			recreateAndStart();
		},
		start: () => {
			wanted = true;
			onListeningChange(true);
			recreateAndStart();
		},
		stop: () => {
			wanted = false;
			generation++;
			clearTimers();
			killRecognition();
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
			resumeFeedback();
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
			const command = parseCommand(transcript);
			if (!command) {
				hud.showToast(lang === "ru-RU" ? `Слышу: ${transcript}` : `Heard: ${transcript}`);
				return;
			}
			const result = applyCommand(command);
			const label = commandLabel(uiLang(lang), command);
			if (command.type === "like") {
				if (result.ok) {
					playLikeFeedback(Boolean(result.already));
					return;
				}
				hud.showToast(lang === "ru-RU" ? `Не вышло: ${label}` : `Failed: ${label}`);
				return;
			}
			if (result.ok) {
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
