export type Output = {
  isHeadphones: () => boolean
  toggle: () => void
  onChange: (cb: (on: boolean) => void) => void
}

export function makeOutput(): Output {
  let on = false
  const subs = new Set<(on: boolean) => void>()
  return {
    isHeadphones: () => on,
    toggle: () => {
      on = !on
      for (const cb of subs) cb(on)
    },
    onChange: (cb) => { subs.add(cb) },
  }
}
