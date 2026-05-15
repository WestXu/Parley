import type { Lang } from "./soniox"
import { voiceFor } from "./tts-voices"

const ENDPOINT = "https://tts-rt.jp.soniox.com/tts"
const MODEL = "tts-rt-v1"
const COOLDOWN_MS = 300
const SPEED = 1.5

type Chan = {
  pan: StereoPannerNode
  queue: HTMLAudioElement[]
  current: HTMLAudioElement | null
}

export type RestTts = {
  speakOnce: (text: string, lang: Lang, speaker: number) => void
  isSpeaking: () => boolean
  stop: () => void
}

export function startRestTts(apiKey: string, langA: Lang, getCtx: () => AudioContext): RestTts {
  let abort: AbortController | null = null
  const chans = new Map<number, Chan>()
  let cooldownUntil = 0

  const panOf = (lang: Lang) => (lang === langA ? -1 : 1)

  const chanFor = (pan: number): Chan => {
    const found = chans.get(pan)
    if (found) return found
    const c = getCtx()
    const node = c.createStereoPanner()
    node.pan.value = pan
    node.connect(c.destination)
    const ch: Chan = { pan: node, queue: [], current: null }
    chans.set(pan, ch)
    return ch
  }

  const playNext = (ch: Chan) => {
    const el = ch.queue.shift() ?? null
    ch.current = el
    if (!el) {
      cooldownUntil = Date.now() + COOLDOWN_MS
      return
    }
    void el.play().catch(() => { })
  }

  const enqueue = (ch: Chan, el: HTMLAudioElement) => {
    el.onended = () => {
      URL.revokeObjectURL(el.src)
      playNext(ch)
    }
    ch.queue.push(el)
    if (!ch.current) playNext(ch)
  }

  const fetchAndPlay = async (text: string, lang: Lang, speaker: number) => {
    const c = getCtx()
    if (!abort) abort = new AbortController()
    const signal = abort.signal

    let res: Response
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          language: lang,
          voice: voiceFor(speaker),
          text,
          audio_format: "wav",
        }),
        signal,
      })
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("tts fetch error", e)
      return
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`tts http ${res.status}: ${body}`)
      return
    }
    let blob: Blob
    try {
      blob = await res.blob()
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("tts read error", e)
      return
    }

    const el = new Audio(URL.createObjectURL(blob))
    el.playbackRate = SPEED
    el.preservesPitch = true

    const ch = chanFor(panOf(lang))
    c.createMediaElementSource(el).connect(ch.pan)
    enqueue(ch, el)
  }

  const isSpeaking = () => {
    if (Date.now() < cooldownUntil) return true
    for (const ch of chans.values()) if (ch.current) return true
    return false
  }

  const stop = () => {
    if (abort) { abort.abort(); abort = null }
    for (const ch of chans.values()) {
      for (const el of [ch.current, ...ch.queue]) {
        if (!el) continue
        el.pause()
        URL.revokeObjectURL(el.src)
      }
      ch.queue.length = 0
      ch.current = null
    }
    chans.clear()
  }

  return {
    speakOnce(text, lang, speaker) {
      if (!text) return
      void fetchAndPlay(text, lang, speaker)
    },
    isSpeaking,
    stop,
  }
}
