import { startSession } from "./translator"

const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined

const $ = <T extends HTMLElement>(sel: string) => {
  const el = document.querySelector(sel) as T | null
  if (!el) throw new Error(`missing ${sel}`)
  return el
}

const startBtn = $<HTMLButtonElement>("#start")
const statusEl = $<HTMLSpanElement>("#status")

type PaneKey = "en-you" | "en-them" | "zh-you" | "zh-them"
const body = (k: PaneKey) => $<HTMLDivElement>(`[data-body="${k}"]`)

function makeAppender(pane: HTMLDivElement) {
  let current: HTMLDivElement | null = null
  return {
    delta(text: string) {
      if (!current) {
        current = document.createElement("div")
        current.className = "turn partial"
        pane.appendChild(current)
      }
      current.textContent = (current.textContent ?? "") + text
      pane.scrollTop = pane.scrollHeight
    },
    done() {
      if (current) current.classList.remove("partial")
      current = null
    },
  }
}

function setStatus(s: string) {
  statusEl.textContent = s
}

type Lang = "en" | "zh"
const statuses: Record<Lang, string> = { en: "idle", zh: "idle" }
function reportStatus(which: Lang, s: string) {
  statuses[which] = s
  setStatus(`EN→ZH: ${statuses.zh} · ZH→EN: ${statuses.en}`)
}

let active: { pcs: RTCPeerConnection[]; stream: MediaStream } | null = null

function setRunning(running: boolean) {
  startBtn.textContent = running ? "Stop" : "Start"
  startBtn.classList.toggle("btn-primary", !running)
  startBtn.classList.toggle("btn-error", running)
}

function stop() {
  if (!active) return
  for (const pc of active.pcs) pc.close()
  for (const t of active.stream.getTracks()) t.stop()
  active = null
  setRunning(false)
  setStatus("stopped")
}

async function start() {
  if (!apiKey) {
    setStatus("missing VITE_OPENAI_API_KEY")
    return
  }
  startBtn.disabled = true
  setStatus("requesting mic")

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch (e) {
    setStatus(`mic denied: ${(e as Error).message}`)
    startBtn.disabled = false
    return
  }
  const micTrack = stream.getAudioTracks()[0]
  if (!micTrack) {
    setStatus("no mic track")
    startBtn.disabled = false
    return
  }

  const zhYou = makeAppender(body("zh-you"))
  const zhThem = makeAppender(body("zh-them"))
  const enYou = makeAppender(body("en-you"))
  const enThem = makeAppender(body("en-them"))

  try {
    const pcs = await Promise.all([
      startSession({
        apiKey, target: "zh", micTrack,
        handlers: {
          onInputDelta: (t) => enYou.delta(t),
          onInputDone: () => enYou.done(),
          onOutputDelta: (t) => zhThem.delta(t),
          onOutputDone: () => zhThem.done(),
          onStatus: (s) => reportStatus("zh", s),
        },
      }),
      startSession({
        apiKey, target: "en", micTrack,
        handlers: {
          onInputDelta: (t) => zhYou.delta(t),
          onInputDone: () => zhYou.done(),
          onOutputDelta: (t) => enThem.delta(t),
          onOutputDone: () => enThem.done(),
          onStatus: (s) => reportStatus("en", s),
        },
      }),
    ])
    active = { pcs, stream }
    setRunning(true)
  } catch (e) {
    console.error(e)
    setStatus(`failed: ${(e as Error).message}`)
    for (const t of stream.getTracks()) t.stop()
  } finally {
    startBtn.disabled = false
  }
}

startBtn.addEventListener("click", () => {
  if (active) stop()
  else start()
})
