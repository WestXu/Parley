import { startMic, type Mic } from "./audio"
import { startSession, LANGS, type Session, type Lang } from "./soniox"
import { makeBoard, type Board } from "./render"
import { isSpeaking } from "./tts"

const apiKey = import.meta.env.VITE_SONIOX_API_KEY as string | undefined
const KEY_A = "translate.langA"
const KEY_B = "translate.langB"

const $ = <T extends HTMLElement>(sel: string) => {
  const el = document.querySelector(sel) as T | null
  if (!el) throw new Error(`missing ${sel}`)
  return el
}

const startBtn = $<HTMLButtonElement>("#start")
const swapBtn = $<HTMLButtonElement>("#swap")
const rotateBtn = $<HTMLButtonElement>("#rotate")
const statusEl = $<HTMLSpanElement>("#status")
const dotEl = $<HTMLSpanElement>("#status-dot")
const langASel = $<HTMLSelectElement>("#lang-a")
const langBSel = $<HTMLSelectElement>("#lang-b")
const aEl = $<HTMLElement>("#pane-a")
const bEl = $<HTMLElement>("#pane-b")
const delBtn = $<HTMLButtonElement>("#del-btn")
const swapLangsBtn = $<HTMLButtonElement>("#swap-langs")

const setStatus = (s: string) => { statusEl.textContent = s }
const setDot = (kind: "neutral" | "success" | "error") => {
  dotEl.className = `status status-sm status-${kind}`
}

const isLang = (s: string): s is Lang => (LANGS as string[]).includes(s)

const storedA = localStorage.getItem(KEY_A)
const storedB = localStorage.getItem(KEY_B)
if (storedA && isLang(storedA)) langASel.value = storedA
if (storedB && isLang(storedB) && storedB !== langASel.value) langBSel.value = storedB

const syncOptions = () => {
  for (const opt of langASel.options) opt.hidden = opt.value === langBSel.value
  for (const opt of langBSel.options) opt.hidden = opt.value === langASel.value
}

const onLangChange = (changed: HTMLSelectElement, other: HTMLSelectElement) => () => {
  if (changed.value === other.value) {
    const alt = Array.from(other.options).find((o) => o.value !== changed.value)
    if (alt) other.value = alt.value
  }
  localStorage.setItem(KEY_A, langASel.value)
  localStorage.setItem(KEY_B, langBSel.value)
  syncOptions()
}

syncOptions()
langASel.addEventListener("change", onLangChange(langASel, langBSel))
langBSel.addEventListener("change", onLangChange(langBSel, langASel))

swapLangsBtn.addEventListener("click", () => {
  const a = langASel.value
  langASel.value = langBSel.value
  langBSel.value = a
  langASel.dispatchEvent(new Event("change"))
})

let active: { mic: Mic; session: Session; board: Board; langA: Lang; langB: Lang } | null = null
let wakeLock: WakeLockSentinel | null = null

const setRunning = (running: boolean) => {
  document.body.classList.toggle("running", running)
  startBtn.textContent = running ? "Stop" : "Start"
  for (const el of [langASel, langBSel, swapLangsBtn]) el.disabled = running
  setDot(running ? "success" : "neutral")
}

const acquireWakeLock = async () => {
  if (wakeLock || !("wakeLock" in navigator)) return
  try { wakeLock = await navigator.wakeLock.request("screen") }
  catch (e) { console.warn("wake lock failed", e) }
}
const releaseWakeLock = () => {
  wakeLock?.release()
  wakeLock = null
}

const stop = () => {
  if (!active) return
  active.session.stop()
  active.mic.stop()
  releaseWakeLock()
  active = null
  setRunning(false)
}

const start = async () => {
  if (!apiKey) {
    setStatus("missing VITE_SONIOX_API_KEY")
    setDot("error")
    return
  }
  const langA = langASel.value
  const langB = langBSel.value
  if (!isLang(langA) || !isLang(langB)) {
    setStatus(`bad lang: ${langA}/${langB}`)
    setDot("error")
    return
  }

  startBtn.disabled = true
  setStatus("requesting mic")

  aEl.replaceChildren()
  bEl.replaceChildren()
  const board = makeBoard(aEl, langA, bEl, langB, delBtn)

  let mic: Mic
  try {
    let session: Session | null = null
    mic = await startMic((pcm) => { if (!isSpeaking()) session?.send(pcm) })
    session = startSession(apiKey, langA, langB, {
      onTokens: board.apply,
      onStatus: setStatus,
      onError: (e) => {
        console.error(e)
        setStatus(e.message)
        setDot("error")
        stop()
      },
    })
    active = { mic, session, board, langA, langB }
    setRunning(true)
    acquireWakeLock()
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
  const main = aEl.parentElement
  if (!main) return
  const first = main.firstElementChild
  const last = main.lastElementChild
  if (first && last && first !== last) main.insertBefore(last, first)
  for (const el of [aEl, bEl]) el.scrollTop = el.scrollHeight
})

rotateBtn.addEventListener("click", () => {
  rotateBtn.classList.toggle("rotated")
  aEl.parentElement?.classList.toggle("top-rotated")
})

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && active) acquireWakeLock()
})

matchMedia("(orientation: portrait)").addEventListener("change", () => {
  requestAnimationFrame(() => {
    for (const el of [aEl, bEl]) el.scrollTop = el.scrollHeight
  })
})
