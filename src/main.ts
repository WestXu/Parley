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
const dotEl = $<HTMLSpanElement>("#status-dot")
const list = $<HTMLElement>("#list")

const setStatus = (s: string) => { statusEl.textContent = s }
const setDot = (kind: "neutral" | "success" | "error") => {
  dotEl.className = `status status-sm status-${kind}`
}

function autoScroll() {
  const slack = list.scrollHeight - list.scrollTop - list.clientHeight
  if (slack < 80) list.scrollTop = list.scrollHeight
}

type Bubble = {
  setTitle: (t: string) => void
  fill: (tr: Triple) => void
  error: (msg: string) => void
}

const BADGE: Record<"zh" | "vi" | "en", string> = {
  zh: "badge-info",
  en: "badge-success",
  vi: "badge-warning",
}

const langBadge = (lang: "zh" | "vi" | "en") => {
  const badge = document.createElement("span")
  badge.className = `badge badge-soft badge-sm shrink-0 ${BADGE[lang]}`
  badge.textContent = lang.toUpperCase()
  return badge
}

function makeBubble(): Bubble {
  const el = document.createElement("article")
  el.className = "bubble card bg-base-200 shadow-sm"

  const body = document.createElement("div")
  body.className = "card-body p-4 gap-2"
  el.appendChild(body)

  const title = document.createElement("div")
  title.className = "bubble-title flex items-center gap-2"
  body.appendChild(title)

  const titleText = document.createElement("span")
  title.appendChild(titleText)

  const loader = document.createElement("span")
  loader.className = "loading loading-dots loading-sm"
  title.appendChild(loader)

  list.appendChild(el)
  autoScroll()

  return {
    setTitle(t) {
      titleText.textContent = t
      autoScroll()
    },
    fill(tr) {
      loader.remove()
      el.dataset.source = tr.source
      titleText.lang = tr.source
      titleText.textContent = tr[tr.source]
      title.insertBefore(langBadge(tr.source), titleText)
      for (const lang of ["zh", "vi", "en"] as const) {
        const row = document.createElement("div")
        row.className = "bubble-tr"
        row.lang = lang
        row.dataset.lang = lang

        const badge = langBadge(lang)
        badge.classList.add("mt-0.5")
        row.appendChild(badge)

        const text = document.createElement("span")
        text.textContent = tr[lang]
        row.appendChild(text)

        body.appendChild(row)
      }
      autoScroll()
    },
    error(msg) {
      loader.remove()
      el.classList.add("error")
      const row = document.createElement("div")
      row.className = "bubble-tr text-error"
      row.textContent = msg
      body.appendChild(row)
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
  setDot(running ? "success" : "neutral")
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
    setDot("error")
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
    setDot("error")
    startBtn.disabled = false
    return
  }
  const micTrack = stream.getAudioTracks()[0]
  if (!micTrack) {
    setStatus("no mic track")
    setDot("error")
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
    setDot("error")
    for (const t of stream.getTracks()) t.stop()
  } finally {
    startBtn.disabled = false
  }
}

startBtn.addEventListener("click", () => {
  if (active) stop()
  else start()
})
