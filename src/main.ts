import { startSession } from "./translator"

const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined

const $ = <T extends HTMLElement>(sel: string) => {
  const el = document.querySelector(sel) as T | null
  if (!el) throw new Error(`missing ${sel}`)
  return el
}

const startBtn = $<HTMLButtonElement>("#start")
const statusEl = $<HTMLSpanElement>("#status")
const bar = $<HTMLDivElement>("#bar")
const audioVi = $<HTMLAudioElement>("#audio-vi")
const audioEn = $<HTMLAudioElement>("#audio-en")

type PaneKey = "en-you" | "en-them" | "vi-you" | "vi-them"
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

type Lang = "en" | "vi"
const statuses: Record<Lang, string> = { en: "idle", vi: "idle" }
function reportStatus(which: Lang, s: string) {
  statuses[which] = s
  setStatus(`EN→VI: ${statuses.vi} · VI→EN: ${statuses.en}`)
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
    return
  }

  const viYou = makeAppender(body("vi-you"))
  const viThem = makeAppender(body("vi-them"))
  const enYou = makeAppender(body("en-you"))
  const enThem = makeAppender(body("en-them"))

  try {
    await Promise.all([
      startSession({
        apiKey, target: "vi", micTrack, audioEl: audioVi,
        handlers: {
          onInputDelta: (t) => enYou.delta(t),
          onInputDone: () => enYou.done(),
          onOutputDelta: (t) => viThem.delta(t),
          onOutputDone: () => viThem.done(),
          onStatus: (s) => reportStatus("vi", s),
        },
      }),
      startSession({
        apiKey, target: "en", micTrack, audioEl: audioEn,
        handlers: {
          onInputDelta: (t) => viYou.delta(t),
          onInputDone: () => viYou.done(),
          onOutputDelta: (t) => enThem.delta(t),
          onOutputDone: () => enThem.done(),
          onStatus: (s) => reportStatus("en", s),
        },
      }),
    ])
    bar.classList.add("hidden")
  } catch (e) {
    console.error(e)
    setStatus(`failed: ${(e as Error).message}`)
    startBtn.disabled = false
  }
}

startBtn.addEventListener("click", start)
