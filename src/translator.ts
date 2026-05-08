const MODEL = "gpt-realtime-translate"
const URL = `https://api.openai.com/v1/realtime/translations/calls?model=${MODEL}`

type Lang = "en" | "vi"

type Handlers = {
  onInputDelta: (text: string) => void
  onInputDone: () => void
  onOutputDelta: (text: string) => void
  onOutputDone: () => void
  onStatus: (s: string) => void
}

type Args = {
  apiKey: string
  target: Lang
  micTrack: MediaStreamTrack
  handlers: Handlers
}

export async function startSession({ apiKey, target, micTrack, handlers }: Args): Promise<RTCPeerConnection> {
  const { onInputDelta, onInputDone, onOutputDelta, onOutputDone, onStatus } = handlers
  onStatus("connecting")

  const pc = new RTCPeerConnection()

  pc.addTrack(micTrack)

  const dc = pc.createDataChannel("oai-events")
  dc.onopen = () => {
    dc.send(JSON.stringify({
      type: "session.update",
      session: { audio: { output: { language: target } } },
    }))
    onStatus("connected")
  }
  dc.onmessage = (e) => {
    let msg: any
    try { msg = JSON.parse(e.data) } catch { return }
    switch (msg.type) {
      case "session.input_transcript.delta":
        if (typeof msg.delta === "string") onInputDelta(msg.delta)
        break
      case "session.input_transcript.done":
        onInputDone()
        break
      case "session.output_transcript.delta":
        if (typeof msg.delta === "string") onOutputDelta(msg.delta)
        break
      case "session.output_transcript.done":
        onOutputDone()
        break
      case "error":
        console.error("realtime error", msg)
        onStatus(`error: ${msg.error?.message ?? "unknown"}`)
        break
    }
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/sdp",
    },
    body: offer.sdp,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SDP exchange failed: ${res.status} ${body}`)
  }
  const answerSdp = await res.text()
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp })

  return pc
}
