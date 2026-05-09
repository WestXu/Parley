const URL = "wss://stt-rt.soniox.com/transcribe-websocket"

export type Lang = "en" | "zh" | "vi" | "ja"

export const LANGS: Lang[] = ["en", "zh", "vi", "ja"]

export type Token = {
  text: string
  language: Lang
  speaker: number
  is_final: boolean
}

type RawToken = {
  text?: string
  language?: string
  speaker?: string | number
  is_final?: boolean
  translation_status?: "none" | "original" | "translation"
}

type Handlers = {
  onTokens: (tokens: Token[]) => void
  onStatus: (s: string) => void
  onError: (e: Error) => void
}

export type Session = {
  send: (pcm: Int16Array) => void
  stop: () => void
}

export function startSession(apiKey: string, langA: Lang, langB: Lang, handlers: Handlers): Session {
  const { onTokens, onStatus, onError } = handlers
  const ws = new WebSocket(URL)
  ws.binaryType = "arraybuffer"

  let open = false
  let lastSpeaker: number | null = null
  const queue: ArrayBuffer[] = []

  ws.onopen = () => {
    ws.send(JSON.stringify({
      api_key: apiKey,
      model: "stt-rt-v4",
      audio_format: "pcm_s16le",
      sample_rate: 16000,
      num_channels: 1,
      language_hints: [langA, langB],
      enable_language_identification: true,
      enable_speaker_diarization: true,
      enable_endpoint_detection: true,
      translation: { type: "two_way", language_a: langA, language_b: langB },
    }))
    open = true
    onStatus("listening")
    for (const buf of queue) ws.send(buf)
    queue.length = 0
  }

  ws.onmessage = (e) => {
    let msg: { tokens?: RawToken[]; error_code?: number | null; error_message?: string }
    try { msg = JSON.parse(e.data) } catch { return }

    if (msg.error_code) {
      onError(new Error(`soniox ${msg.error_code}: ${msg.error_message ?? ""}`))
      return
    }
    const raw = msg.tokens ?? []
    const out: Token[] = []
    for (const t of raw) {
      if (!t.text) continue
      if (t.translation_status === "none") continue
      const lang = t.language === langA || t.language === langB ? t.language : null
      if (!lang) continue
      const parsed = t.speaker == null ? NaN : Number(t.speaker)
      if (Number.isFinite(parsed)) lastSpeaker = parsed
      const speaker = Number.isFinite(parsed) ? parsed : (lastSpeaker ?? 0)
      out.push({ text: t.text, language: lang, speaker, is_final: t.is_final === true })
    }
    if (out.length) onTokens(out)
  }

  ws.onerror = () => onError(new Error("websocket error"))
  ws.onclose = (e) => {
    open = false
    onStatus(e.wasClean ? "stopped" : `closed: ${e.code}`)
  }

  return {
    send(pcm) {
      const buf = pcm.buffer as ArrayBuffer
      if (!open) { queue.push(buf); return }
      ws.send(buf)
    },
    stop() {
      if (open) {
        try { ws.send("") } catch {}
      }
      try { ws.close() } catch {}
    },
  }
}
