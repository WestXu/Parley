const SEG: Record<string, string> = { us: "", eu: ".eu", jp: ".jp" }

export type SonioxUrls = { stt: string; tts: string }

export function sonioxUrls(region: string | undefined): SonioxUrls {
  const key = (region ?? "us").trim().toLowerCase()
  const seg = SEG[key]
  if (region && seg === undefined) console.warn(`unknown VITE_REGION "${region}", using us`)
  return {
    stt: `wss://stt-rt${seg ?? ""}.soniox.com/transcribe-websocket`,
    tts: `wss://tts-rt${seg ?? ""}.soniox.com/tts-websocket`,
  }
}
