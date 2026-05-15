import type { Lang } from "./soniox"
import { startRestTts } from "./tts-rest"
import { startRealtimeTts } from "./tts-realtime"

export type Tts = {
  feed: (text: string, lang: Lang, speaker: number) => void
  endUtterance: () => void
  speakOnce: (text: string, lang: Lang, speaker: number) => void
  isSpeaking: () => boolean
  stop: () => void
}

export function startTts(apiKey: string, langA: Lang): Tts {
  let ctx: AudioContext | null = null
  const getCtx = (): AudioContext => {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  }

  const rest = startRestTts(apiKey, langA, getCtx)
  const realtime = startRealtimeTts(apiKey, langA, getCtx)

  return {
    feed: realtime.feed,
    endUtterance: realtime.endUtterance,
    speakOnce: rest.speakOnce,
    isSpeaking: rest.isSpeaking,
    stop: () => {
      rest.stop()
      realtime.stop()
      if (ctx) {
        ctx.close().catch(() => { })
        ctx = null
      }
    },
  }
}
