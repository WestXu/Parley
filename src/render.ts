import type { Lang, Token } from "./soniox"
import { speak } from "./tts"

export type Board = { apply: (tokens: Token[]) => void; destroy: () => void }

type Side = "a" | "b"

type Line = {
  el: HTMLParagraphElement
  liveEl: HTMLSpanElement
  speaker: number
}

type PaneState = {
  root: HTMLElement
  lang: Lang
  line: Line | null
}

export function makeBoard(
  aEl: HTMLElement,
  langA: Lang,
  bEl: HTMLElement,
  langB: Lang,
): Board {
  aEl.lang = langA
  bEl.lang = langB

  const a: PaneState = { root: aEl, lang: langA, line: null }
  const b: PaneState = { root: bEl, lang: langB, line: null }

  const chunks = new Map<string, HTMLSpanElement>()
  let selected: HTMLSpanElement | null = null

  const chunkKey = (speaker: number, chunk_id: number, side: Side) =>
    `${speaker}-${chunk_id}-${side}`
  const flipKey = (key: string) => key.slice(0, -1) + (key.endsWith("a") ? "b" : "a")
  const partnerOf = (span: HTMLSpanElement) => {
    const key = span.dataset.key
    return key ? chunks.get(flipKey(key)) ?? null : null
  }
  const sideOfSpan = (span: HTMLSpanElement): Side => span.dataset.side as Side

  const sideOf = (lang: Lang): Side => (lang === langA ? "a" : "b")
  const paneOf = (side: Side): PaneState => (side === "a" ? a : b)

  const openLine = (pane: PaneState, speaker: number): Line => {
    const el = document.createElement("p")
    el.className = "line"
    el.dataset.speaker = String(speaker)

    const badge = document.createElement("span")
    badge.className = "speaker-badge"
    badge.textContent = `S${speaker}`
    el.appendChild(badge)

    const liveEl = document.createElement("span")
    liveEl.className = "live"
    el.appendChild(liveEl)

    pane.root.appendChild(el)
    return { el, liveEl, speaker }
  }

  const ensureLine = (pane: PaneState, speaker: number): Line => {
    if (pane.line?.speaker === speaker) return pane.line
    if (pane.line) {
      pane.line.liveEl.textContent = ""
      if (!pane.line.el.querySelector(".sentence")) pane.line.el.remove()
    }
    pane.line = openLine(pane, speaker)
    return pane.line
  }

  const clearSelection = () => {
    if (!selected) return
    selected.classList.remove("selected")
    partnerOf(selected)?.classList.remove("selected")
    selected = null
  }

  const select = (span: HTMLSpanElement) => {
    if (selected === span) return
    if (selected) {
      selected.classList.remove("selected")
      partnerOf(selected)?.classList.remove("selected")
    }
    selected = span
    span.classList.add("selected")
    partnerOf(span)?.classList.add("selected")
  }

  const removeSentence = (span: HTMLSpanElement) => {
    const pane = paneOf(sideOfSpan(span))
    const line = span.parentElement as HTMLParagraphElement | null
    const key = span.dataset.key
    if (key) chunks.delete(key)
    span.remove()
    if (!line || line.querySelector(".sentence")) return
    if (line.querySelector(".live")?.textContent) return
    if (pane.line?.el === line) pane.line = null
    line.remove()
  }

  const makeTok = (t: Token): HTMLSpanElement => {
    const s = document.createElement("span")
    s.className = "tok"
    s.style.setProperty("--c", String(t.confidence))
    s.textContent = t.text
    return s
  }

  const addToChunk = (side: Side, speaker: number, chunk_id: number, tokens: Token[]) => {
    const key = chunkKey(speaker, chunk_id, side)
    const existing = chunks.get(key)
    if (existing) {
      const del = existing.querySelector(".del")
      for (const t of tokens) existing.insertBefore(makeTok(t), del)
      return
    }

    const pane = paneOf(side)
    const line = ensureLine(pane, speaker)

    const span = document.createElement("span")
    span.className = "sentence"
    span.dataset.key = key
    span.dataset.side = side
    for (const t of tokens) span.appendChild(makeTok(t))

    const del = document.createElement("button")
    del.className = "del"
    del.setAttribute("aria-label", "delete")
    span.appendChild(del)

    line.el.insertBefore(span, line.liveEl)
    chunks.set(key, span)

    const partner = chunks.get(flipKey(key))
    if (partner && selected === partner) span.classList.add("selected")
  }

  const onPaneClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (!target) return

    const del = target.closest(".del") as HTMLElement | null
    if (del) {
      const span = del.parentElement as HTMLSpanElement | null
      if (!span) return
      e.stopPropagation()
      const partner = partnerOf(span)
      if (selected === span || selected === partner) selected = null
      removeSentence(span)
      if (partner) removeSentence(partner)
      return
    }

    const span = target.closest(".sentence") as HTMLSpanElement | null
    if (!span) {
      clearSelection()
      return
    }
    e.stopPropagation()
    if (span.classList.contains("selected")) {
      speak(span.textContent ?? "", paneOf(sideOfSpan(span)).lang)
    } else {
      select(span)
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") clearSelection()
  }

  aEl.addEventListener("click", onPaneClick)
  bEl.addEventListener("click", onPaneClick)
  document.addEventListener("keydown", onKeyDown)

  const destroy = () => {
    aEl.removeEventListener("click", onPaneClick)
    bEl.removeEventListener("click", onPaneClick)
    document.removeEventListener("keydown", onKeyDown)
  }

  const sameRun = (x: Token, y: Token) =>
    x.is_final === y.is_final &&
    x.language === y.language &&
    x.speaker === y.speaker

  const flushRun = (run: Token[]) => {
    if (!run.length) return
    const head = run[0]!
    const side = sideOf(head.language)
    const pane = paneOf(side)

    if (!head.is_final) {
      const line = ensureLine(pane, head.speaker)
      const text = run.map((t) => t.text).join("")
      line.liveEl.textContent = (line.liveEl.textContent ?? "") + text
      return
    }
    if (head.chunk_id == null) return
    addToChunk(side, head.speaker, head.chunk_id, run)
  }

  const apply = (tokens: Token[]) => {
    if (!tokens.length) return

    if (a.line) a.line.liveEl.textContent = ""
    if (b.line) b.line.liveEl.textContent = ""

    let run: Token[] = []
    for (const t of tokens) {
      if (run.length && !sameRun(run[0]!, t)) {
        flushRun(run)
        run = []
      }
      run.push(t)
    }
    flushRun(run)

    aEl.scrollTop = aEl.scrollHeight
    bEl.scrollTop = bEl.scrollHeight
  }

  return { apply, destroy }
}
