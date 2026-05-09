import type { Token } from "./soniox"

export type Pane = {
  apply: (tokens: Token[]) => void
}

type Line = {
  finalEl: HTMLSpanElement
  liveEl: HTMLSpanElement
  speaker: number
}

export function makePane(root: HTMLElement, lang: string): Pane {
  root.lang = lang
  let line: Line | null = null

  const openLine = (speaker: number): Line => {
    if (line) line.liveEl.textContent = ""

    const el = document.createElement("p")
    el.className = "line"
    el.dataset.speaker = String(speaker)

    const badge = document.createElement("span")
    badge.className = "speaker-badge"
    badge.textContent = `S${speaker}`
    el.appendChild(badge)

    const finalEl = document.createElement("span")
    finalEl.className = "final"
    el.appendChild(finalEl)

    const liveEl = document.createElement("span")
    liveEl.className = "live"
    el.appendChild(liveEl)

    root.appendChild(el)
    return { finalEl, liveEl, speaker }
  }

  const scroll = () => { root.scrollTop = root.scrollHeight }

  return {
    apply(tokens) {
      if (!tokens.length) return
      if (line) line.liveEl.textContent = ""

      for (const t of tokens) {
        if (!line || line.speaker !== t.speaker) line = openLine(t.speaker)
        if (t.is_final) {
          line.finalEl.textContent = (line.finalEl.textContent ?? "") + t.text
        } else {
          line.liveEl.textContent = (line.liveEl.textContent ?? "") + t.text
        }
      }
      scroll()
    },
  }
}
