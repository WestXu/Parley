type Pick = { deviceId?: string }

// "default" / "communications" are synthetic aliases the OS layers on top of a
// real device ("Default - AirPods" is just "AirPods"); drop them so each physical
// mic appears once.
const SYNTHETIC = new Set(["default", "communications"])

async function audioInputs(): Promise<MediaDeviceInfo[]> {
  const md = navigator.mediaDevices
  const inputs = async () =>
    (await md.enumerateDevices()).filter(
      (d) => d.kind === "audioinput" && !SYNTHETIC.has(d.deviceId),
    )

  // Labels stay blank until mic permission is granted; probe once to unlock them.
  let devices = await inputs()
  if (devices.some((d) => !d.label)) {
    const probe = await md.getUserMedia({ audio: true })
    for (const t of probe.getTracks()) t.stop()
    devices = await inputs()
  }
  return devices
}

// Resolves to the chosen input, or null when the user dismisses the popup.
export async function pickInput(): Promise<Pick | null> {
  const devices = await audioInputs()
  if (devices.length <= 1) return { deviceId: devices[0]?.deviceId }

  return new Promise<Pick | null>((resolve) => {
    const modal = document.createElement("div")
    modal.className = "modal modal-open"

    const box = document.createElement("div")
    box.className = "modal-box"

    const title = document.createElement("h3")
    title.className = "font-bold text-lg mb-2"
    title.textContent = "Choose microphone"

    const list = document.createElement("div")
    list.className = "flex flex-col gap-2 mt-2"

    const backdrop = document.createElement("div")
    backdrop.className = "modal-backdrop"

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null)
    }
    const close = (pick: Pick | null) => {
      document.removeEventListener("keydown", onKey)
      modal.remove()
      resolve(pick)
    }

    for (const d of devices) {
      const btn = document.createElement("button")
      btn.className = "btn btn-block btn-soft justify-start"
      btn.textContent = d.label || "Microphone"
      btn.addEventListener("click", () => close({ deviceId: d.deviceId }))
      list.appendChild(btn)
    }

    backdrop.addEventListener("click", () => close(null))
    document.addEventListener("keydown", onKey)

    box.append(title, list)
    modal.append(box, backdrop)
    document.body.appendChild(modal)
  })
}
