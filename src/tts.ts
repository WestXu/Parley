import type { Lang } from "./soniox"

const URL = "https://tts-rt.jp.soniox.com/tts"
const MODEL = "tts-rt-v1"
const VOICE = "Adrian"
const COOLDOWN_MS = 300

type PanState = {
  node: StereoPannerNode
  nextStart: number
  active: Set<AudioBufferSourceNode>
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
  const pans = new Map<number, PanState>()
  let cooldownUntil = 0

  const panOf = (lang: Lang) => (lang === langA ? -1 : 1)

  const ensureCtx = (): AudioContext => {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  }

  const panFor = (pan: number): PanState => {
    let ps = pans.get(pan)
    if (ps) return ps
    const c = ensureCtx()
    const node = c.createStereoPanner()
    node.pan.value = pan
    node.connect(c.destination)
    ps = { node, nextStart: 0, active: new Set() }
    pans.set(pan, ps)
    return ps
  }

  const fetchAndPlay = async (text: string, lang: Lang) => {
    const c = ensureCtx()
    if (!abort) abort = new AbortController()
    const signal = abort.signal

    let res: Response
    try {
      res = await fetch(URL, {
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
    let bytes: ArrayBuffer
    try {
      bytes = await res.arrayBuffer()
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("tts read error", e)
      return
    }
    let buf: AudioBuffer
    try {
      buf = await c.decodeAudioData(bytes)
    } catch (e) {
      console.error("tts decode error", e)
      return
    }

    const ps = panFor(panOf(lang))
    const src = c.createBufferSource()
    src.buffer = buf
    src.connect(ps.node)
    const startAt = Math.max(ps.nextStart, c.currentTime)
    src.start(startAt)
    ps.nextStart = startAt + buf.duration
    ps.active.add(src)
    src.onended = () => {
      ps.active.delete(src)
      cooldownUntil = Date.now() + COOLDOWN_MS
    }
  }

  const speak = (text: string, lang: Lang) => {
    if (!text) return
    void fetchAndPlay(text, lang)
  }

  const isSpeaking = () => {
    if (Date.now() < cooldownUntil) return true
    for (const ps of pans.values()) if (ps.active.size > 0) return true
    return false
  }

  const stop = () => {
    if (abort) { abort.abort(); abort = null }
    for (const ps of pans.values()) {
      for (const src of ps.active) { try { src.stop() } catch { } }
      ps.active.clear()
    }
    pans.clear()
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
