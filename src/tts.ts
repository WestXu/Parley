import type { Lang } from "./soniox"

const LOCALE: Record<Lang, string> = {
  en: "en-US",
  zh: "zh-CN",
  vi: "vi-VN",
  ja: "ja-JP",
}

export function speak(text: string, lang: Lang) {
  const synth = window.speechSynthesis
  if (!synth) return
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = LOCALE[lang]
  synth.speak(u)
}
