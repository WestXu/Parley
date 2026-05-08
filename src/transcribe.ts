const MODEL = "gpt-realtime-whisper"
const URL = "https://api.openai.com/v1/realtime/calls"

const SESSION = {
  type: "transcription",
  audio: { input: { transcription: { model: MODEL } } },
}

type Handlers = {
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onStatus: (s: string) => void
}

type Args = {
  apiKey: string
  micTrack: MediaStreamTrack
  handlers: Handlers
}

export async function startTranscription({ apiKey, micTrack, handlers }: Args): Promise<RTCPeerConnection> {
  const { onPartial, onFinal, onStatus } = handlers
  onStatus("connecting")

  const pc = new RTCPeerConnection()
  pc.addTrack(micTrack)

  let buffer = ""

  const dc = pc.createDataChannel("oai-events")
  dc.onopen = () => onStatus("listening")
  dc.onmessage = (e) => {
    let msg: any
    try { msg = JSON.parse(e.data) } catch { return }

    const t: string = msg.type ?? ""
    if (t.endsWith("transcription.delta")) {
      const d = typeof msg.delta === "string" ? msg.delta : ""
      if (!d) return
      buffer += d
      onPartial(buffer)
      return
    }
    if (t.endsWith("transcription.completed") || t.endsWith("transcription.done")) {
      const final = (typeof msg.transcript === "string" && msg.transcript) || buffer
      buffer = ""
      if (final) onFinal(final)
      return
    }
    if (t === "error") {
      console.error("realtime error", msg)
      onStatus(`error: ${msg.error?.message ?? "unknown"}`)
      return
    }
    console.debug("realtime event", t, msg)
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  const form = new FormData()
  form.append("sdp", offer.sdp ?? "")
  form.append("session", JSON.stringify(SESSION))

  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SDP exchange failed: ${res.status} ${body}`)
  }
  const answerSdp = await res.text()
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp })

  return pc
}
