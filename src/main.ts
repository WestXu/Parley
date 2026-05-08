import { startTranscription } from "./transcribe"
import { translate, type Triple } from "./translate"

const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined

const $ = <T extends HTMLElement>(sel: string) => {
  const el = document.querySelector(sel) as T | null
  if (!el) throw new Error(`missing ${sel}`)
  return el
}

const startBtn = $<HTMLButtonElement>("#start")
const statusEl = $<HTMLSpanElement>("#status")
const list = $<HTMLElement>("#list")

const setStatus = (s: string) => { statusEl.textContent = s }

function autoScroll() {
  const slack = list.scrollHeight - list.scrollTop - list.clientHeight
  if (slack < 80) list.scrollTop = list.scrollHeight
}

type Bubble = {
  setTitle: (t: string) => void
  finalize: () => void
  fill: (tr: Triple) => void
  error: (msg: string) => void
}

function makeBubble(): Bubble {
  const el = document.createElement("article")
  el.className = "bubble partial"
  const title = document.createElement("div")
  title.className = "bubble-title"
  el.appendChild(title)
  list.appendChild(el)
  autoScroll()

  return {
    setTitle(t) {
      title.textContent = t
      autoScroll()
    },
    finalize() {
      el.classList.remove("partial")
    },
    fill(tr) {
      el.dataset.source = tr.source
      title.lang = tr.source
      title.textContent = tr[tr.source]
      for (const lang of ["zh", "vi", "en"] as const) {
        const row = document.createElement("div")
        row.className = "bubble-tr"
        row.lang = lang
        row.textContent = tr[lang]
        el.appendChild(row)
      }
      autoScroll()
    },
    error(msg) {
      el.classList.add("error")
      const row = document.createElement("div")
      row.className = "bubble-tr"
      row.textContent = msg
      el.appendChild(row)
      autoScroll()
    },
  }
}

let active: { pc: RTCPeerConnection; stream: MediaStream } | null = null
let partial: Bubble | null = null

function setRunning(running: boolean) {
  startBtn.textContent = running ? "Stop" : "Start"
  startBtn.classList.toggle("btn-primary", !running)
  startBtn.classList.toggle("btn-error", running)
}

function stop() {
  if (!active) return
  active.pc.close()
  for (const t of active.stream.getTracks()) t.stop()
  active = null
  partial = null
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

  try {
    const pc = await startTranscription({
      apiKey,
      micTrack,
      handlers: {
        onPartial: (text) => {
          if (!partial) partial = makeBubble()
          partial.setTitle(text)
        },
        onFinal: (text) => {
          const bubble = partial ?? makeBubble()
          partial = null
          bubble.setTitle(text)
          bubble.finalize()
          translate(apiKey, text)
            .then((tr) => bubble.fill(tr))
            .catch((e) => {
              console.error(e)
              bubble.error((e as Error).message)
            })
        },
        onStatus: setStatus,
      },
    })
    active = { pc, stream }
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
