import type { ParsedCommand } from './commands'

export type ApplyResult = {
  already?: boolean
  ok: boolean
}

type LikeRenderer = HTMLElement & {
  likeStatus?: string
}

type VolumeSlider = HTMLElement & {
  value?: number
}

const PLAYER_BAR = 'ytmusic-player-bar'
const VOLUME_STEP = 10

function selectPlayerBar() {
  return document.querySelector<HTMLElement>(PLAYER_BAR)
}

function selectVideo() {
  return document.querySelector<HTMLVideoElement>('ytmusic-player video')
    ?? document.querySelector<HTMLVideoElement>('video')
}

function selectVolumeSlider(): VolumeSlider | null {
  const bar = selectPlayerBar()
  const fromBar = bar?.querySelector<VolumeSlider>('tp-yt-paper-slider#volume-slider')
    ?? bar?.querySelector<VolumeSlider>('#volume-slider')
    ?? bar?.querySelector<VolumeSlider>('tp-yt-paper-slider.volume-slider')

  return fromBar
    ?? document.querySelector<VolumeSlider>('tp-yt-paper-slider#volume-slider')
}

function clickHost(el: HTMLElement) {
  const inner = el.tagName === 'YT-ICON-BUTTON'
    ? el.querySelector<HTMLElement>('button')
    : null
  ;(inner ?? el).click()
}

function clickFirst(selectors: string[]): boolean {
  const scopes: ParentNode[] = []
  const bar = selectPlayerBar()
  if (bar) scopes.push(bar)
  scopes.push(document)

  for (const scope of scopes) {
    for (const selector of selectors) {
      const el = scope.querySelector<HTMLElement>(selector)
      if (!el) continue
      clickHost(el)
      return true
    }
  }

  return false
}

function playPauseButton() {
  return selectPlayerBar()?.querySelector<HTMLElement>('#play-pause-button')
    ?? document.querySelector<HTMLElement>('#play-pause-button')
}

function playPauseLabel() {
  const button = playPauseButton()
  return (
    button?.getAttribute('title')
    ?? button?.querySelector('button')?.getAttribute('aria-label')
    ?? button?.getAttribute('aria-label')
    ?? ''
  ).toLowerCase()
}

function isPaused() {
  const label = playPauseLabel()
  if (/pause|пауза/.test(label)) return false
  if (/play|воспроизвести/.test(label)) return true

  return ![...document.querySelectorAll<HTMLVideoElement>('video')]
    .some(video => !video.paused && !video.ended)
}

function clickPlayPause() {
  return clickFirst(['#play-pause-button button', '#play-pause-button'])
}

function play() {
  if (!isPaused()) return true
  return clickPlayPause()
}

function pause() {
  if (isPaused()) return true

  const playing = [...document.querySelectorAll<HTMLVideoElement>('video')]
    .filter(video => !video.paused && !video.ended)
  const clicked = clickPlayPause()
  for (const video of playing) video.pause()
  return clicked || playing.length > 0
}

function readSliderValue(slider: VolumeSlider) {
  const fromProp = Number(slider.value)
  if (Number.isFinite(fromProp)) return fromProp

  const fromAttr = Number(
    slider.getAttribute('aria-valuenow') ?? slider.getAttribute('value'),
  )
  return Number.isFinite(fromAttr) ? fromAttr : 50
}

function writeVolume(level: number) {
  const next = Math.min(100, Math.max(0, Math.round(level)))
  const slider = selectVolumeSlider()
  const video = selectVideo()

  if (slider) {
    slider.value = next
    slider.setAttribute('value', String(next))
    slider.setAttribute('aria-valuenow', String(next))
    slider.dispatchEvent(new Event('immediate-value-change', { bubbles: true }))
    slider.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  if (!video) return false

  video.volume = next / 100
  if (video.volume > 0) video.muted = false
  return true
}

function adjustVolume(delta: number) {
  const slider = selectVolumeSlider()
  if (slider) return writeVolume(readSliderValue(slider) + delta)

  const video = selectVideo()
  if (!video) return false

  return writeVolume(video.volume * 100 + delta)
}

function selectLikeRenderer() {
  const bar = selectPlayerBar()
  return bar?.querySelector<LikeRenderer>('ytmusic-like-button-renderer')
    ?? document.querySelector<LikeRenderer>('ytmusic-like-button-renderer')
}

function isLiked(renderer: LikeRenderer) {
  const status = (renderer.getAttribute('like-status') ?? renderer.likeStatus ?? '').toUpperCase()
  return status === 'LIKE'
}

function like(): ApplyResult {
  const renderer = selectLikeRenderer()
  if (!renderer) return { ok: false }
  if (isLiked(renderer)) return { already: true, ok: true }

  const scopes: ParentNode[] = [renderer]
  const bar = selectPlayerBar()
  if (bar) scopes.push(bar)
  scopes.push(document)

  for (const scope of scopes) {
    for (const selector of ['#button-shape-like button', '#like-button button', '#like-button']) {
      const el = scope.querySelector<HTMLElement>(selector)
      if (!el) continue
      clickHost(el)
      return { ok: true }
    }
  }

  return { ok: false }
}

export function applyCommand(command: ParsedCommand): ApplyResult {
  switch (command.type) {
    case 'like':
      return like()
    case 'next':
      return { ok: clickFirst(['.next-button', '[aria-label="Next"]', '[title="Next"]']) }
    case 'pause':
      return { ok: pause() }
    case 'play':
      return { ok: play() }
    case 'prev':
      return { ok: clickFirst(['.previous-button', '[aria-label="Previous"]', '[title="Previous"]']) }
    case 'setVolume':
      return { ok: writeVolume(command.level) }
    case 'volumeDown':
      return { ok: adjustVolume(-VOLUME_STEP) }
    case 'volumeUp':
      return { ok: adjustVolume(VOLUME_STEP) }
  }
}
