import type { Lang } from "./soniox"
import { makeStretcher } from "./tts-stretch"
import { voiceFor } from "./tts-voices"

const ENDPOINT = "https://tts-rt.jp.soniox.com/tts"
const MODEL = "tts-rt-v1"
const COOLDOWN_MS = 300

type Chan = {
  pan: StereoPannerNode
  queue: AudioBuffer[]
  current: AudioBufferSourceNode | null
}

export type RestTts = {
  speakOnce: (text: string, lang: Lang, speaker: number) => void
  isSpeaking: () => boolean
  stop: () => void
}

export function startRestTts(apiKey: string, langA: Lang, getCtx: () => AudioContext, speed: number): RestTts {
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
    const buf = ch.queue.shift() ?? null
    if (!buf) {
      ch.current = null
      cooldownUntil = Date.now() + COOLDOWN_MS
      return
    }
    const src = getCtx().createBufferSource()
    src.buffer = buf
    src.connect(ch.pan)
    src.onended = () => { playNext(ch) }
    ch.current = src
    src.start()
  }

  const enqueue = (ch: Chan, buf: AudioBuffer) => {
    ch.queue.push(buf)
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
    let arr: ArrayBuffer
    try {
      arr = await res.arrayBuffer()
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("tts read error", e)
      return
    }

    let decoded: AudioBuffer
    try {
      decoded = await c.decodeAudioData(arr)
    } catch (e) {
      console.error("tts decode error", e)
      return
    }
    if (signal.aborted) return

    const stretcher = makeStretcher(speed, c.sampleRate)
    const head = stretcher.push(decoded.getChannelData(0))
    const tail = stretcher.flush()
    if (!head.length && !tail.length) return

    const buf = c.createBuffer(1, head.length + tail.length, c.sampleRate)
    const channel = buf.getChannelData(0)
    channel.set(head)
    channel.set(tail, head.length)
    enqueue(chanFor(panOf(lang)), buf)
  }

  const isSpeaking = () => {
    if (Date.now() < cooldownUntil) return true
    for (const ch of chans.values()) if (ch.current) return true
    return false
  }

  const stop = () => {
    if (abort) { abort.abort(); abort = null }
    for (const ch of chans.values()) {
      if (ch.current) {
        ch.current.onended = null
        try { ch.current.stop() } catch { }
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
