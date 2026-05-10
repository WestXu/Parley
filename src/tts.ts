import type { Lang } from "./soniox"

const LOCALE: Record<Lang, string> = {
  en: "en-US",
  zh: "zh-CN",
  vi: "vi-VN",
  ja: "ja-JP",
  th: "th-TH",
}

const COOLDOWN_MS = 300
let cooldownUntil = 0

export function speak(text: string, lang: Lang) {
  const synth = window.speechSynthesis
  if (!synth) return
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = LOCALE[lang]
  const bumpCooldown = () => { cooldownUntil = Date.now() + COOLDOWN_MS }
  u.onend = bumpCooldown
  u.onerror = bumpCooldown
  synth.speak(u)
}

export const isSpeaking = () =>
  window.speechSynthesis?.speaking === true || Date.now() < cooldownUntil
