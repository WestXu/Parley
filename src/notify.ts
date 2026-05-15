type Kind = "info" | "success" | "error"

const container = document.querySelector("#toast") as HTMLElement
const FADE_MS = 200
const HOLD_MS = 2500

let current: HTMLElement | null = null

const dismiss = (el: HTMLElement) => {
  el.classList.add("opacity-0")
  setTimeout(() => el.remove(), FADE_MS)
}

export function notify(message: string, kind: Kind) {
  current?.remove()

  const el = document.createElement("div")
  el.className = `alert alert-soft alert-${kind} w-auto max-w-[90vw] shadow-lg pointer-events-auto transition-opacity duration-200 opacity-0`
  el.textContent = message
  container.appendChild(el)
  current = el
  requestAnimationFrame(() => el.classList.remove("opacity-0"))

  if (kind === "error") {
    el.classList.add("cursor-pointer")
    el.addEventListener("click", () => {
      if (current === el) current = null
      dismiss(el)
    })
    return
  }

  setTimeout(() => {
    if (current !== el) return
    current = null
    dismiss(el)
  }, HOLD_MS)
}
