import { startMic, type Mic } from "./audio"
import { pickInput } from "./pick-device"
import { startSession, LANGS, type Session, type Lang } from "./soniox"
import { makeBoard, type Board } from "./render"
import { startTts, type Tts } from "./tts"
import { makeOutput } from "./output"
import { notify } from "./notify"

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
const epBtn = $<HTMLButtonElement>("#ep")
const langASel = $<HTMLSelectElement>("#lang-a")
const langBSel = $<HTMLSelectElement>("#lang-b")
const aEl = $<HTMLElement>("#pane-a")
const bEl = $<HTMLElement>("#pane-b")
const swapLangsBtn = $<HTMLButtonElement>("#swap-langs")

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

const output = makeOutput()
const renderEp = (on: boolean) => {
  epBtn.classList.toggle("btn-ghost", !on)
  epBtn.classList.toggle("btn-primary", on)
}
renderEp(output.isHeadphones())
output.onChange(renderEp)
epBtn.addEventListener("click", () => output.toggle())

let active: { mic: Mic; session: Session; board: Board; tts: Tts; langA: Lang; langB: Lang } | null = null
let board: Board | null = null
let wakeLock: WakeLockSentinel | null = null

const setRunning = (running: boolean) => {
  document.body.classList.toggle("running", running)
  startBtn.setAttribute("aria-label", running ? "stop translation" : "start translation")
  for (const el of [langASel, langBSel, swapLangsBtn, epBtn]) el.disabled = running
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
  active.tts.stop()
  releaseWakeLock()
  active = null
  setRunning(false)
}

const start = async () => {
  if (!apiKey) {
    notify("missing VITE_SONIOX_API_KEY", "error")
    return
  }
  const langA = langASel.value
  const langB = langBSel.value
  if (!isLang(langA) || !isLang(langB)) {
    notify(`bad lang: ${langA}/${langB}`, "error")
    return
  }

  startBtn.disabled = true

  let deviceId: string | undefined
  if (output.isHeadphones()) {
    try {
      const picked = await pickInput()
      if (!picked) { startBtn.disabled = false; return }
      deviceId = picked.deviceId
    } catch (e) {
      notify((e as Error).message, "error")
      startBtn.disabled = false
      return
    }
  }

  notify("requesting mic", "info")

  board?.destroy()
  aEl.replaceChildren()
  bEl.replaceChildren()
  const tts = startTts(apiKey, langA)
  const fresh = makeBoard(aEl, langA, bEl, langB, tts, output)
  board = fresh

  let mic: Mic
  try {
    let session: Session | null = null
    mic = await startMic((pcm) => {
      if (output.isHeadphones() || !tts.isSpeaking()) session?.send(pcm)
    }, deviceId)
    session = startSession(apiKey, langA, langB, {
      onTokens: fresh.apply,
      onStatus: (s) => notify(s, s === "listening" ? "success" : "info"),
      onError: (e) => {
        console.error(e)
        notify(e.message, "error")
        stop()
      },
    })
    active = { mic, session, board: fresh, tts, langA, langB }
    setRunning(true)
    acquireWakeLock()
  } catch (e) {
    console.error(e)
    notify((e as Error).message, "error")
  } finally {
    startBtn.disabled = false
  }
}

startBtn.addEventListener("click", () => {
  if (active) stop()
  else start()
})

swapBtn.addEventListener("click", () => {
  for (const el of [aEl, bEl]) {
    el.classList.toggle("is-top")
    el.classList.toggle("is-bottom")
    el.scrollTop = el.scrollHeight
  }
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
