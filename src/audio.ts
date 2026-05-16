export type Mic = {
  stop: () => void
}

const AUDIO: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

// The device's own mic carries one of these OS labels; AirPods and other
// Bluetooth devices carry their product name, so this match excludes them.
// Picking the built-in mic keeps Bluetooth output in high-quality A2DP.
const BUILT_IN = /iPad|iPhone|MacBook|Built-?in|Internal/i

async function builtInMicId(): Promise<string | undefined> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.find((d) => d.kind === "audioinput" && BUILT_IN.test(d.label))?.deviceId
}

async function captureStream(deviceId?: string): Promise<MediaStream> {
  const md = navigator.mediaDevices
  const exact = (id: string) =>
    md.getUserMedia({ audio: { ...AUDIO, deviceId: { exact: id } } })

  // Headphone mode: the user explicitly picked this input, so honour it directly.
  if (deviceId) {
    try { return await exact(deviceId) } catch { return md.getUserMedia({ audio: AUDIO }) }
  }

  // Permission granted on a prior visit: labels are already populated, so we
  // can target the built-in mic directly without ever opening the AirPods mic.
  const known = await builtInMicId()
  if (known) {
    try { return await exact(known) } catch {}
  }

  // First run: labels stay blank until permission is granted. Open the default
  // device once to unlock them, then re-acquire if it isn't the built-in mic.
  const stream = await md.getUserMedia({ audio: AUDIO })
  const id = await builtInMicId()
  if (!id || stream.getAudioTracks()[0]?.getSettings().deviceId === id) return stream
  for (const t of stream.getTracks()) t.stop()
  try { return await exact(id) } catch { return md.getUserMedia({ audio: AUDIO }) }
}

export async function startMic(
  onFrame: (pcm: Int16Array) => void,
  deviceId?: string,
): Promise<Mic> {
  const stream = await captureStream(deviceId)

  const ctx = new AudioContext({ sampleRate: 16000 })
  await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-worklet.js`)

  const src = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, "pcm-worklet")
  node.port.onmessage = (e) => onFrame(e.data as Int16Array)
  src.connect(node)

  return {
    stop() {
      node.port.onmessage = null
      try { src.disconnect() } catch {}
      try { node.disconnect() } catch {}
      ctx.close().catch(() => {})
      for (const t of stream.getTracks()) t.stop()
    },
  }
}
