import { startMic, type Mic } from "./audio"
import { startSession, LANGS, type Session, type Token, type Lang } from "./soniox"
import { makePane, type Pane } from "./render"

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
syncOptions()

const onChange = (self: HTMLSelectElement, other: HTMLSelectElement, prev: { value: string }) => () => {
  if (self.value === other.value) other.value = prev.value
  prev.value = self.value
  localStorage.setItem(KEY_A, langASel.value)
  localStorage.setItem(KEY_B, langBSel.value)
  syncOptions()
}

const prevA = { value: langASel.value }
const prevB = { value: langBSel.value }
langASel.addEventListener("change", onChange(langASel, langBSel, prevA))
langBSel.addEventListener("change", onChange(langBSel, langASel, prevB))

let active: { mic: Mic; session: Session; aPane: Pane; bPane: Pane; langA: Lang; langB: Lang } | null = null
let lastA: Lang | null = null
let lastB: Lang | null = null

const setRunning = (running: boolean) => {
  startBtn.textContent = running ? "Stop" : "Start"
  startBtn.classList.toggle("btn-primary", !running)
  startBtn.classList.toggle("btn-error", running)
  langASel.disabled = running
  langBSel.disabled = running
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
  const langA = langASel.value
  const langB = langBSel.value
  if (!isLang(langA) || !isLang(langB)) {
    setStatus(`bad lang: ${langA}/${langB}`)
    setDot("error")
    return
  }

  startBtn.disabled = true
  setStatus("requesting mic")

  if (lastA !== langA || lastB !== langB) {
    aEl.replaceChildren()
    bEl.replaceChildren()
  } else {
    for (const el of [aEl, bEl]) {
      for (const live of el.querySelectorAll(".live")) live.textContent = ""
    }
  }
  lastA = langA
  lastB = langB
  const aPane = makePane(aEl, langA)
  const bPane = makePane(bEl, langB)

  const route = (tokens: Token[]) => {
    const a: Token[] = []
    const b: Token[] = []
    for (const t of tokens) (t.language === langA ? a : b).push(t)
    aPane.apply(a)
    bPane.apply(b)
  }

  let mic: Mic
  try {
    let session: Session | null = null
    mic = await startMic((pcm) => session?.send(pcm))
    session = startSession(apiKey, langA, langB, {
      onTokens: route,
      onStatus: setStatus,
      onError: (e) => {
        console.error(e)
        setStatus(e.message)
        setDot("error")
        stop()
      },
    })
    active = { mic, session, aPane, bPane, langA, langB }
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
  const main = aEl.parentElement
  if (!main) return
  const first = main.firstElementChild
  const last = main.lastElementChild
  if (first && last && first !== last) main.insertBefore(last, first)
  for (const el of [aEl, bEl]) el.scrollTop = el.scrollHeight
})

rotateBtn.addEventListener("click", () => {
  aEl.parentElement?.classList.toggle("top-rotated")
})
