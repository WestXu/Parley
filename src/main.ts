import { startMic, type Mic } from "./audio"
import { startSession, type Session, type Token } from "./soniox"
import { makePane } from "./render"

const apiKey = import.meta.env.VITE_SONIOX_API_KEY as string | undefined

const $ = <T extends HTMLElement>(sel: string) => {
  const el = document.querySelector(sel) as T | null
  if (!el) throw new Error(`missing ${sel}`)
  return el
}

const startBtn = $<HTMLButtonElement>("#start")
const statusEl = $<HTMLSpanElement>("#status")
const dotEl = $<HTMLSpanElement>("#status-dot")

const setStatus = (s: string) => { statusEl.textContent = s }
const setDot = (kind: "neutral" | "success" | "error") => {
  dotEl.className = `status status-sm status-${kind}`
}

const zhPane = makePane($<HTMLElement>("#pane-zh"), "zh")
const enPane = makePane($<HTMLElement>("#pane-en"), "en")

const route = (tokens: Token[]) => {
  const zh: Token[] = []
  const en: Token[] = []
  for (const t of tokens) (t.language === "zh" ? zh : en).push(t)
  zhPane.apply(zh)
  enPane.apply(en)
}

let active: { mic: Mic; session: Session } | null = null

const setRunning = (running: boolean) => {
  startBtn.textContent = running ? "Stop" : "Start"
  startBtn.classList.toggle("btn-primary", !running)
  startBtn.classList.toggle("btn-error", running)
  setDot(running ? "success" : "neutral")
}

const stop = () => {
  if (!active) return
  active.session.stop()
  active.mic.stop()
  active = null
  setRunning(false)
}

const start = async () => {
  if (!apiKey) {
    setStatus("missing VITE_SONIOX_API_KEY")
    setDot("error")
    return
  }
  startBtn.disabled = true
  setStatus("requesting mic")

  let mic: Mic
  try {
    let session: Session | null = null
    mic = await startMic((pcm) => session?.send(pcm))
    session = startSession(apiKey, {
      onTokens: route,
      onStatus: setStatus,
      onError: (e) => {
        console.error(e)
        setStatus(e.message)
        setDot("error")
        stop()
      },
    })
    active = { mic, session }
    setRunning(true)
  } catch (e) {
    console.error(e)
    setStatus((e as Error).message)
    setDot("error")
  } finally {
    startBtn.disabled = false
  }
}

startBtn.addEventListener("click", () => {
  if (active) stop()
  else start()
})
