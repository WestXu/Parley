import { startMic, type Mic } from "./audio"
import { startSession, type Session, type Token, type OtherLang } from "./soniox"
import { makePane, type Pane } from "./render"

const apiKey = import.meta.env.VITE_SONIOX_API_KEY as string | undefined
const LANG_KEY = "translate.otherLang"

const $ = <T extends HTMLElement>(sel: string) => {
  const el = document.querySelector(sel) as T | null
  if (!el) throw new Error(`missing ${sel}`)
  return el
}

const startBtn = $<HTMLButtonElement>("#start")
const swapBtn = $<HTMLButtonElement>("#swap")
const statusEl = $<HTMLSpanElement>("#status")
const dotEl = $<HTMLSpanElement>("#status-dot")
const langSel = $<HTMLSelectElement>("#lang")
const otherEl = $<HTMLElement>("#pane-other")
const enEl = $<HTMLElement>("#pane-en")

const setStatus = (s: string) => { statusEl.textContent = s }
const setDot = (kind: "neutral" | "success" | "error") => {
  dotEl.className = `status status-sm status-${kind}`
}

const isOtherLang = (s: string): s is OtherLang => s === "zh" || s === "vi" || s === "ja"

const stored = localStorage.getItem(LANG_KEY)
if (stored && isOtherLang(stored)) langSel.value = stored
langSel.addEventListener("change", () => localStorage.setItem(LANG_KEY, langSel.value))

let active: { mic: Mic; session: Session; otherPane: Pane; enPane: Pane; otherLang: OtherLang } | null = null
let lastLang: OtherLang | null = null

const setRunning = (running: boolean) => {
  startBtn.textContent = running ? "Stop" : "Start"
  startBtn.classList.toggle("btn-primary", !running)
  startBtn.classList.toggle("btn-error", running)
  langSel.disabled = running
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
  const otherLang = langSel.value
  if (!isOtherLang(otherLang)) {
    setStatus(`bad lang: ${otherLang}`)
    setDot("error")
    return
  }

  startBtn.disabled = true
  setStatus("requesting mic")

  if (lastLang !== otherLang) {
    otherEl.replaceChildren()
    enEl.replaceChildren()
  } else {
    for (const el of [otherEl, enEl]) {
      for (const live of el.querySelectorAll(".live")) live.textContent = ""
    }
  }
  lastLang = otherLang
  const otherPane = makePane(otherEl, otherLang)
  const enPane = makePane(enEl, "en")

  const route = (tokens: Token[]) => {
    const other: Token[] = []
    const en: Token[] = []
    for (const t of tokens) (t.language === "en" ? en : other).push(t)
    otherPane.apply(other)
    enPane.apply(en)
  }

  let mic: Mic
  try {
    let session: Session | null = null
    mic = await startMic((pcm) => session?.send(pcm))
    session = startSession(apiKey, otherLang, {
      onTokens: route,
      onStatus: setStatus,
      onError: (e) => {
        console.error(e)
        setStatus(e.message)
        setDot("error")
        stop()
      },
    })
    active = { mic, session, otherPane, enPane, otherLang }
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

swapBtn.addEventListener("click", () => {
  const main = otherEl.parentElement
  if (!main) return
  const first = main.firstElementChild
  const last = main.lastElementChild
  if (first && last && first !== last) main.insertBefore(last, first)
  for (const el of [otherEl, enEl]) el.scrollTop = el.scrollHeight
})
