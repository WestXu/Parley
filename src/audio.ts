export type Mic = {
  stop: () => void
}

export async function startMic(onFrame: (pcm: Int16Array) => void): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })

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
