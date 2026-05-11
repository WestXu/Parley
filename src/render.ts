import type { Lang, Token } from "./soniox"
import { speak } from "./tts"

export type Board = { apply: (tokens: Token[]) => void }

type Side = "a" | "b"

type Sentence = {
  span: HTMLSpanElement
  partner: Sentence | null
  side: Side
  key: string
}

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
  delBtn: HTMLButtonElement,
): Board {
  aEl.lang = langA
  bEl.lang = langB

  const a: PaneState = { root: aEl, lang: langA, line: null }
  const b: PaneState = { root: bEl, lang: langB, line: null }

  const chunks = new Map<string, Sentence>()
  const byEl = new WeakMap<HTMLSpanElement, Sentence>()
  let selected: Sentence | null = null

  const chunkKey = (speaker: number, chunk_id: number, side: Side) =>
    `${speaker}-${chunk_id}-${side}`

  const delBtn2 = delBtn.cloneNode(true) as HTMLButtonElement
  delBtn2.id = `${delBtn.id}-2`
  delBtn.parentElement?.insertBefore(delBtn2, delBtn.nextSibling)

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
    if (!pane.line || pane.line.speaker !== speaker) {
      pane.line = openLine(pane, speaker)
    }
    return pane.line
  }

  const placeBtn = (btn: HTMLButtonElement, span: HTMLSpanElement) => {
    const rects = span.getClientRects()
    const last = rects[rects.length - 1]
    if (!last) return
    const w = btn.offsetWidth
    const h = btn.offsetHeight
    btn.style.left = `${last.right - w / 2}px`
    btn.style.top = `${last.top + (last.height - h) / 2}px`
  }

  const positionDelBtn = () => {
    if (!selected) return
    delBtn.style.display = "flex"
    placeBtn(delBtn, selected.span)
    if (selected.partner) {
      delBtn2.style.display = "flex"
      placeBtn(delBtn2, selected.partner.span)
    } else {
      delBtn2.style.display = "none"
    }
  }

  const clearSelection = () => {
    if (!selected) return
    selected.span.classList.remove("selected")
    selected.partner?.span.classList.remove("selected")
    selected = null
    delBtn.style.display = "none"
    delBtn2.style.display = "none"
  }

  const select = (s: Sentence) => {
    if (selected) {
      selected.span.classList.remove("selected")
      selected.partner?.span.classList.remove("selected")
    }
    selected = s
    s.span.classList.add("selected")
    s.partner?.span.classList.add("selected")
    positionDelBtn()
  }

  const pruneLine = (pane: PaneState, line: HTMLParagraphElement) => {
    const hasSentence = line.querySelector(".sentence")
    const live = line.querySelector(".live")
    const liveEmpty = !live || !live.textContent
    if (hasSentence || !liveEmpty) return
    if (pane.line && pane.line.el === line) pane.line = null
    line.remove()
  }

  const removeSentence = (s: Sentence) => {
    const pane = paneOf(s.side)
    const line = s.span.parentElement as HTMLParagraphElement | null
    byEl.delete(s.span)
    chunks.delete(s.key)
    s.span.remove()
    if (line) pruneLine(pane, line)
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
      for (const t of tokens) existing.span.appendChild(makeTok(t))
      if (selected === existing || selected?.partner === existing) positionDelBtn()
      return
    }

    const pane = paneOf(side)
    const line = ensureLine(pane, speaker)

    const span = document.createElement("span")
    span.className = "sentence"
    for (const t of tokens) span.appendChild(makeTok(t))
    line.el.insertBefore(span, line.liveEl)

    const seg: Sentence = { span, partner: null, side, key }
    byEl.set(span, seg)
    chunks.set(key, seg)

    const partner = chunks.get(chunkKey(speaker, chunk_id, side === "a" ? "b" : "a"))
    if (partner) {
      seg.partner = partner
      partner.partner = seg
      if (selected === partner) {
        seg.span.classList.add("selected")
        positionDelBtn()
      }
    }
  }

  const onRootClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    const span = target?.closest(".sentence") as HTMLSpanElement | null
    if (!span) return
    const seg = byEl.get(span)
    if (!seg) return
    if (span.classList.contains("selected")) {
      speak(span.textContent ?? "", paneOf(seg.side).lang)
    } else {
      select(seg)
    }
    e.stopPropagation()
  }

  aEl.addEventListener("click", onRootClick)
  bEl.addEventListener("click", onRootClick)

  aEl.addEventListener("scroll", positionDelBtn, { passive: true })
  bEl.addEventListener("scroll", positionDelBtn, { passive: true })
  window.addEventListener("resize", positionDelBtn)

  document.addEventListener("click", (e) => {
    const target = e.target as Node | null
    if (!target) return
    if (target instanceof Element && target.closest(".sentence")) return
    if (delBtn.contains(target) || delBtn2.contains(target)) return
    clearSelection()
  })

  const onDelClick = (e: MouseEvent) => {
    e.stopPropagation()
    if (!selected) return
    const partner = selected.partner
    removeSentence(selected)
    if (partner) removeSentence(partner)
    selected = null
    delBtn.style.display = "none"
    delBtn2.style.display = "none"
  }
  delBtn.addEventListener("click", onDelClick)
  delBtn2.addEventListener("click", onDelClick)

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") clearSelection()
  })

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
    positionDelBtn()
  }

  return { apply }
}
