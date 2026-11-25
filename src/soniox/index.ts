import { openStream } from "./stream"

export type Lang = "en" | "zh" | "vi" | "ja" | "th" | "nl" | "pt" | "fr" | "es" | "ru" | "ko" | "tr" | "it" | "id"

export const LANGS: Lang[] = ["en", "zh", "vi", "ja", "th", "nl", "pt", "fr", "es", "ru", "ko", "tr", "it", "id"]

export type Token = {
  text: string
  language: Lang
  speaker: number
  is_final: boolean
  status: "original" | "translation"
  chunk_id: number | null
  confidence: number
}

export type Item = Token | { end: true }

type RawToken = {
  text?: string
  language?: string
  speaker?: string | number
  is_final?: boolean
  translation_status?: "none" | "original" | "translation"
  confidence?: number
}

type Handlers = {
  onTokens: (items: Item[]) => void
  onStatus: (s: "listening" | "reconnecting") => void
  onError: (e: Error) => void
}

export type Session = {
  send: (pcm: Int16Array) => void
  stop: () => void
}

export function startSession(apiKey: string, sttUrl: string, langA: Lang, langB: Lang, handlers: Handlers): Session {
  const { onTokens, onStatus, onError } = handlers
  let lastSpeaker: number | null = null

  const onResponse = (res: object) => {
    const msg = res as { tokens?: RawToken[]; final_audio_proc_ms?: number }
    const raw = msg.tokens ?? []
    const chunk_id = typeof msg.final_audio_proc_ms === "number" ? msg.final_audio_proc_ms : null
    const out: Item[] = []
    for (const t of raw) {
      if (!t.text) continue
      if (t.text === "<end>") { out.push({ end: true }); continue }
      const status = t.translation_status
      if (status !== "original" && status !== "translation") continue
      const lang = t.language === langA || t.language === langB ? t.language : null
      if (!lang) continue
      const parsed = t.speaker == null ? NaN : Number(t.speaker)
      if (Number.isFinite(parsed)) lastSpeaker = parsed
      const speaker = Number.isFinite(parsed) ? parsed : (lastSpeaker ?? 0)
      const is_final = t.is_final === true
      out.push({
        text: t.text,
        language: lang,
        speaker,
        is_final,
        status,
        chunk_id: is_final ? chunk_id : null,
        confidence: typeof t.confidence === "number" ? t.confidence : 1,
      })
    }
    if (out.length) onTokens(out)
  }

  const stream = openStream(sttUrl, apiKey, {
    model: "stt-rt-v6",
    audio_format: "pcm_s16le",
    sample_rate: 16000,
    num_channels: 1,
    language_hints: [langA, langB],
    enable_language_identification: true,
    enable_speaker_diarization: true,
    enable_endpoint_detection: true,
    translation: { type: "two_way", language_a: langA, language_b: langB },
  }, { onResponse, onStatus, onError })

  return {
    send: (pcm) => stream.send(pcm.buffer as ArrayBuffer),
    stop: stream.close,
  }
}
