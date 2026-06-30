import type { Lang } from "./soniox"
import { startRealtimeTts } from "./tts-realtime"

export type Tts = {
  feed: (text: string, lang: Lang, speaker: number) => void
  endUtterance: () => void
  speakOnce: (text: string, lang: Lang, speaker: number) => void
  isSpeaking: () => boolean
  stop: () => void
}

const BCP47: Record<Lang, string> = {
  en: "en-US",
  zh: "zh-CN",
  vi: "vi-VN",
  ja: "ja-JP",
  th: "th-TH",
  nl: "nl-NL",
  pt: "pt-BR",
  fr: "fr-FR",
  es: "es-ES",
  ru: "ru-RU",
  ko: "ko-KR",
  tr: "tr-TR",
  cs: "cs-CZ",
}
const SPEED = 1.25
const COOLDOWN_MS = 300

export function startTts(apiKey: string, ttsUrl: string, langA: Lang): Tts {
  let ctx: AudioContext | null = null
  const getCtx = (): AudioContext => {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  }

  const realtime = startRealtimeTts(apiKey, ttsUrl, langA, getCtx)

  let cooldownUntil = 0
  const pending = new Set<string>()

  const speakOnce = (text: string, lang: Lang) => {
    if (!text || pending.has(text)) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = BCP47[lang]
    u.rate = SPEED
    u.onend = u.onerror = () => {
      cooldownUntil = Date.now() + COOLDOWN_MS
      pending.delete(text)
    }
    pending.add(text)
    speechSynthesis.speak(u)
  }

  const isSpeaking = () =>
    speechSynthesis.speaking || speechSynthesis.pending || Date.now() < cooldownUntil

  return {
    feed: realtime.feed,
    endUtterance: realtime.endUtterance,
    speakOnce,
    isSpeaking,
    stop: () => {
      speechSynthesis.cancel()
      pending.clear()
      realtime.stop()
      if (ctx) {
        ctx.close().catch(() => { })
        ctx = null
      }
    },
  }
}
