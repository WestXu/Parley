import type { Lang } from "./soniox"
import { makeStretcher, type Stretcher } from "./tts-stretch"
import { voiceFor } from "./tts-voices"

const ENDPOINT = "wss://tts-rt.jp.soniox.com/tts-websocket"
const MODEL = "tts-rt-v1"
const SAMPLE_RATE = 24000
const KEEPALIVE_MS = 20000
const LEAD_S = 0.08
const GAP_S = 0.15

export type RealtimeTts = {
  feed: (text: string, lang: Lang, speaker: number) => void
  endUtterance: () => void
  stop: () => void
}

type Stream = { id: string; lang: Lang; speaker: number; carry: Uint8Array | null; stretch: Stretcher }

type ServerMsg = {
  stream_id?: string
  audio?: string
  audio_end?: boolean
  terminated?: boolean
  error_code?: number
  error_message?: string
}

export function startRealtimeTts(apiKey: string, langA: Lang, getCtx: () => AudioContext, speed: number): RealtimeTts {
  const streams = new Map<string, Stream>()
  const sources = new Set<AudioBufferSourceNode>()
  const pans = new Map<number, StereoPannerNode>()
  const outbox: object[] = []
  let ws: WebSocket | null = null
  let keepalive: number | null = null
  let current: Stream | null = null
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

  const decodePcm = (stream: Stream, b64: string): Float32Array => {
    const bin = atob(b64)
    let bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    if (stream.carry) {
      const merged = new Uint8Array(stream.carry.length + bytes.length)
      merged.set(stream.carry)
      merged.set(bytes, stream.carry.length)
      bytes = merged
      stream.carry = null
    }
    if (bytes.length % 2 === 1) {
      stream.carry = bytes.slice(bytes.length - 1)
      bytes = bytes.slice(0, bytes.length - 1)
    }
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
    const f32 = new Float32Array(bytes.length >> 1)
    for (let i = 0; i < f32.length; i++) f32[i] = dv.getInt16(i * 2, true) / 32768
    return f32
  }

  const scheduleSamples = (stream: Stream, f32: Float32Array) => {
    const ctx = getCtx()
    const buf = ctx.createBuffer(1, f32.length, SAMPLE_RATE)
    buf.getChannelData(0).set(f32)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(panFor(stream.lang))
    const startAt = Math.max(ctx.currentTime + LEAD_S, nextStartTime)
    src.start(startAt)
    nextStartTime = startAt + buf.duration
    sources.add(src)
    src.onended = () => { sources.delete(src) }
  }

  const scheduleChunk = (stream: Stream, b64: string) => {
    const f32 = decodePcm(stream, b64)
    if (!f32.length) return
    const out = stream.stretch.push(f32)
    if (out.length) scheduleSamples(stream, out)
  }

  const send = (obj: object) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
    else outbox.push(obj)
  }

  const onMessage = (e: MessageEvent) => {
    let msg: ServerMsg
    try { msg = JSON.parse(e.data) } catch { return }
    if (!msg.stream_id) return
    const stream = streams.get(msg.stream_id)
    if (!stream) return
    if (msg.error_code) {
      console.error(`tts-rt ${msg.error_code}: ${msg.error_message ?? ""}`)
      return
    }
    if (typeof msg.audio === "string" && msg.audio) scheduleChunk(stream, msg.audio)
    if (msg.audio_end === true) {
      const tail = stream.stretch.flush()
      if (tail.length) scheduleSamples(stream, tail)
      nextStartTime += GAP_S
    }
    if (msg.terminated === true) {
      streams.delete(stream.id)
      if (current === stream) current = null
    }
  }

  const connect = () => {
    const sock = new WebSocket(ENDPOINT)
    ws = sock
    sock.onopen = () => {
      keepalive = window.setInterval(() => {
        try { sock.send(JSON.stringify({ keep_alive: true })) } catch { }
      }, KEEPALIVE_MS)
      for (const obj of outbox) {
        try { sock.send(JSON.stringify(obj)) } catch { }
      }
      outbox.length = 0
    }
    sock.onmessage = onMessage
    sock.onclose = () => {
      if (ws !== sock) return
      if (keepalive != null) { clearInterval(keepalive); keepalive = null }
      ws = null
      current = null
      streams.clear()
      outbox.length = 0
    }
  }

  const ensureWs = () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
    connect()
  }

  const openStream = (lang: Lang, speaker: number): Stream => {
    const stream: Stream = { id: `s${++seq}`, lang, speaker, carry: null, stretch: makeStretcher(speed, SAMPLE_RATE) }
    streams.set(stream.id, stream)
    send({
      api_key: apiKey,
      model: MODEL,
      language: lang,
      voice: voiceFor(speaker),
      audio_format: "pcm_s16le",
      sample_rate: SAMPLE_RATE,
      stream_id: stream.id,
    })
    return stream
  }

  const feed = (text: string, lang: Lang, speaker: number) => {
    if (!text) return
    ensureWs()
    if (current && (current.lang !== lang || current.speaker !== speaker)) {
      send({ stream_id: current.id, text_end: true })
      current = null
    }
    if (!current) current = openStream(lang, speaker)
    send({ text, text_end: false, stream_id: current.id })
  }

  const endUtterance = () => {
    if (!current) return
    send({ stream_id: current.id, text_end: true })
    current = null
  }

  const stop = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      for (const stream of streams.values()) {
        try { ws.send(JSON.stringify({ stream_id: stream.id, cancel: true })) } catch { }
      }
    }
    streams.clear()
    current = null
    outbox.length = 0
    if (keepalive != null) { clearInterval(keepalive); keepalive = null }
    if (ws) { try { ws.close() } catch { } ws = null }
    for (const src of sources) { try { src.stop() } catch { } }
    sources.clear()
    nextStartTime = 0
  }

  return { feed, endUtterance, stop }
}
