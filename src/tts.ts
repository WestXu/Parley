import type { Lang } from "./soniox"

const ENDPOINT = "https://tts-rt.jp.soniox.com/tts"
const MODEL = "tts-rt-v1"
const VOICE = "Adrian"
const COOLDOWN_MS = 300
const SPEED = 1.5

type Chan = {
  pan: StereoPannerNode
  queue: HTMLAudioElement[]
  current: HTMLAudioElement | null
}

export type Tts = {
  feed: (text: string, lang: Lang) => void
  speakOnce: (text: string, lang: Lang) => void
  isSpeaking: () => boolean
  stop: () => void
}

export function startTts(apiKey: string, langA: Lang, langB: Lang): Tts {
  let ctx: AudioContext | null = null
  let abort: AbortController | null = null
  const chans = new Map<number, Chan>()
  let cooldownUntil = 0

  const panOf = (lang: Lang) => (lang === langA ? -1 : 1)

  const ensureCtx = (): AudioContext => {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  }

  const chanFor = (pan: number): Chan => {
    let ch = chans.get(pan)
    if (ch) return ch
    const c = ensureCtx()
    const node = c.createStereoPanner()
    node.pan.value = pan
    node.connect(c.destination)
    ch = { pan: node, queue: [], current: null }
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

  const fetchAndPlay = async (text: string, lang: Lang) => {
    const c = ensureCtx()
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
          voice: VOICE,
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

  const speak = (text: string, lang: Lang) => {
    if (!text) return
    void fetchAndPlay(text, lang)
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
    if (ctx) {
      ctx.close().catch(() => { })
      ctx = null
    }
  }

  return {
    feed: speak,
    speakOnce: speak,
    isSpeaking,
    stop,
  }
}
