export type Region = "us" | "eu" | "jp"

const SEG: Record<Region, string> = { us: "", eu: ".eu", jp: ".jp" }
const NAME: Record<Region, string> = { us: "US", eu: "EU", jp: "Japan" }

export type Endpoint = { region: Region; name: string; apiKey: string; stt: string; tts: string }
export type Candidate = { region: Region; apiKey: string }

const PROBE_TIMEOUT_MS = 3000

function urls(region: Region): { stt: string; tts: string } {
  const seg = SEG[region]
  return {
    stt: `wss://stt-rt${seg}.soniox.com/transcribe-websocket`,
    tts: `wss://tts-rt${seg}.soniox.com/tts-websocket`,
  }
}

function probeOnce(sttUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const t0 = performance.now()
    const ws = new WebSocket(sttUrl)
    const done = (ms: number) => {
      clearTimeout(timer)
      try { ws.close() } catch { }
      resolve(ms)
    }
    const timer = setTimeout(() => done(Infinity), PROBE_TIMEOUT_MS)
    ws.onopen = () => done(performance.now() - t0)
    ws.onerror = () => done(Infinity)
  })
}

async function probe(sttUrl: string): Promise<number> {
  const a = await probeOnce(sttUrl)
  const b = await probeOnce(sttUrl)
  return Math.min(a, b)
}

const toEndpoint = ({ region, apiKey }: Candidate): Endpoint => ({
  region,
  name: NAME[region],
  apiKey,
  ...urls(region),
})

export async function pickEndpoint(candidates: Candidate[]): Promise<Endpoint> {
  const [first, ...rest] = candidates
  if (!first) throw new Error("no Soniox region candidates")
  if (rest.length === 0) return toEndpoint(first)

  const probed = await Promise.all(
    candidates.map(async (c) => ({ c, ms: await probe(urls(c.region).stt) })),
  )
  console.log(`region latency: ${probed.map(({ c, ms }) => `${c.region}=${Math.round(ms)}ms`).join(" ")}`)

  const best = probed.reduce((a, b) => (b.ms < a.ms ? b : a))
  return toEndpoint(best.ms === Infinity ? first : best.c)
}
