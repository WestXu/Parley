import type { Lang } from "./soniox"

type Utterance = { speaker: number; orig: string; trans: string }

const sentenceText = (span: Element): string =>
  Array.from(span.querySelectorAll(".tok"))
    .map((t) => t.textContent ?? "")
    .join("")
    .trim()

export function serialize(aEl: HTMLElement, bEl: HTMLElement, langA: Lang, langB: Lang): string {
  const groups = new Map<string, { chunk: number; u: Utterance }>()
  for (const span of [...aEl.querySelectorAll(".sentence"), ...bEl.querySelectorAll(".sentence")]) {
    const key = (span as HTMLElement).dataset.key
    if (!key) continue
    const [speaker, chunk] = key.split("-")
    const groupKey = `${speaker}-${chunk}`
    const g = groups.get(groupKey) ?? { chunk: Number(chunk), u: { speaker: Number(speaker), orig: "", trans: "" } }
    const text = sentenceText(span)
    if ((span as HTMLElement).dataset.status === "original") g.u.orig = text
    else g.u.trans = text
    groups.set(groupKey, g)
  }

  const sorted = Array.from(groups.values()).sort((x, y) => x.chunk - y.chunk)

  const header = `Parley — ${langA} ↔ ${langB} — ${new Date().toLocaleString()}`
  const body = sorted
    .map(({ u }) => {
      const first = u.orig || u.trans
      const second = u.orig && u.trans ? u.trans : ""
      const label = `S${u.speaker}  `
      const block = `${label}${first}`
      return second ? `${block}\n    ${second}` : block
    })
    .join("\n\n")

  return `${header}\n\n${body}\n`
}

export async function share(text: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ title: "Parley transcript", text })
    } catch (e) {
      if ((e as Error).name !== "AbortError") throw e
    }
    return
  }

  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")
  const a = document.createElement("a")
  a.href = url
  a.download = `parley-${stamp}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
