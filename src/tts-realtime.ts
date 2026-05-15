import type { Lang } from "./soniox"
import { voiceFor } from "./tts-voices"

const ENDPOINT = "wss://tts-rt.jp.soniox.com/tts-websocket"
const MODEL = "tts-rt-v1"
const SAMPLE_RATE = 24000
const KEEPALIVE_MS = 20000
const LEAD_S = 0.08
const GAP_S = 0.15

export type RealtimeTts = {
  feed: (text: string, lang: Lang, speaker: number) => void
  stop: () => void
}

type Pending = { text: string; lang: Lang; speaker: number }
type ServerMsg = {
  stream_id?: string
  audio?: string
  audio_end?: boolean
  terminated?: boolean
  error_code?: number
  error_message?: string
}

export function startRealtimeTts(apiKey: string, langA: Lang, getCtx: () => AudioContext): RealtimeTts {
  const pending: Pending[] = []
  const sources = new Set<AudioBufferSourceNode>()
  const pans = new Map<number, StereoPannerNode>()
  let ws: WebSocket | null = null
  let keepalive: number | null = null
  let active: { streamId: string; lang: Lang } | null = null
  let carry: Uint8Array | null = null
  let nextStartTime = 0
  let seq = 0

  const panFor = (lang: Lang): StereoPannerNode => {
    const pan = lang === langA ? -1 : 1
    const found = pans.get(pan)
    if (found) return found
    const ctx = getCtx()
    const node = ctx.createStereoPanner()
    node.pan.value = pan
    node.connect(ctx.destination)
    pans.set(pan, node)
    return node
  }

  const decodePcm = (b64: string): Float32Array => {
    const bin = atob(b64)
    let bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    if (carry) {
      const merged = new Uint8Array(carry.length + bytes.length)
      merged.set(carry)
      merged.set(bytes, carry.length)
      bytes = merged
      carry = null
    }
    if (bytes.length % 2 === 1) {
      carry = bytes.slice(bytes.length - 1)
      bytes = bytes.slice(0, bytes.length - 1)
    }
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
    const f32 = new Float32Array(bytes.length >> 1)
    for (let i = 0; i < f32.length; i++) f32[i] = dv.getInt16(i * 2, true) / 32768
    return f32
  }

  const scheduleChunk = (b64: string, lang: Lang) => {
    const f32 = decodePcm(b64)
    if (!f32.length) return
    const ctx = getCtx()
    const buf = ctx.createBuffer(1, f32.length, SAMPLE_RATE)
    buf.getChannelData(0).set(f32)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(panFor(lang))
    const startAt = Math.max(ctx.currentTime + LEAD_S, nextStartTime)
    src.start(startAt)
    nextStartTime = startAt + buf.duration
    sources.add(src)
    src.onended = () => { sources.delete(src) }
  }

  const processNext = () => {
    if (active) return
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const item = pending.shift()
    if (!item) return
    const streamId = `s${++seq}`
    active = { streamId, lang: item.lang }
    carry = null
    ws.send(JSON.stringify({
      api_key: apiKey,
      model: MODEL,
      language: item.lang,
      voice: voiceFor(item.speaker),
      audio_format: "pcm_s16le",
      sample_rate: SAMPLE_RATE,
      stream_id: streamId,
    }))
    ws.send(JSON.stringify({ text: item.text, text_end: true, stream_id: streamId }))
  }

  const onMessage = (e: MessageEvent) => {
    let msg: ServerMsg
    try { msg = JSON.parse(e.data) } catch { return }
    if (!active || msg.stream_id !== active.streamId) return
    if (msg.error_code) {
      console.error(`tts-rt ${msg.error_code}: ${msg.error_message ?? ""}`)
      return
    }
    if (typeof msg.audio === "string" && msg.audio) scheduleChunk(msg.audio, active.lang)
    if (msg.audio_end === true) nextStartTime += GAP_S
    if (msg.terminated === true) {
      active = null
      carry = null
      processNext()
    }
  }

  const connect = () => {
    const sock = new WebSocket(ENDPOINT)
    ws = sock
    sock.onopen = () => {
      keepalive = window.setInterval(() => {
        try { sock.send(JSON.stringify({ keep_alive: true })) } catch { }
      }, KEEPALIVE_MS)
      processNext()
    }
    sock.onmessage = onMessage
    sock.onclose = () => {
      if (ws !== sock) return
      if (keepalive != null) { clearInterval(keepalive); keepalive = null }
      ws = null
      active = null
      carry = null
    }
  }

  const ensureWs = () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
    connect()
  }

  const feed = (text: string, lang: Lang, speaker: number) => {
    if (!text) return
    pending.push({ text, lang, speaker })
    ensureWs()
    processNext()
  }

  const stop = () => {
    pending.length = 0
    if (ws && ws.readyState === WebSocket.OPEN && active) {
      try { ws.send(JSON.stringify({ stream_id: active.streamId, cancel: true })) } catch { }
    }
    active = null
    carry = null
    if (keepalive != null) { clearInterval(keepalive); keepalive = null }
    if (ws) { try { ws.close() } catch { } ws = null }
    for (const src of sources) { try { src.stop() } catch { } }
    sources.clear()
    nextStartTime = 0
  }

  return { feed, stop }
}
