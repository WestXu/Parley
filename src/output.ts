const KEY = "translate.headphones"

export type Output = {
  isHeadphones: () => boolean
  toggle: () => void
  onChange: (cb: (on: boolean) => void) => void
}

export function makeOutput(): Output {
  let on = localStorage.getItem(KEY) === "1"
  const subs = new Set<(on: boolean) => void>()
  return {
    isHeadphones: () => on,
    toggle: () => {
      on = !on
      localStorage.setItem(KEY, on ? "1" : "0")
      for (const cb of subs) cb(on)
    },
    onChange: (cb) => { subs.add(cb) },
  }
}
