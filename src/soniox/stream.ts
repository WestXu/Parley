// Soniox's default idle timeout; the stream waits this long for a reconnect.
const IDLE_MS = 20000
const QUARTER = IDLE_MS / 4

type Message = ArrayBuffer | string

type Response = {
  type?: string
  seq?: number
  id?: number
  error_code?: number | null
  error_message?: string
  finished?: boolean
  reconnect_token?: string
  reconnect_url?: string
  last_request?: number
}

type Handlers = {
  onResponse: (msg: object) => void
  onStatus: (s: "listening" | "reconnecting") => void
  onError: (e: Error) => void
}

export type Stream = {
  send: (m: Message) => void
  close: () => void
}

// https://docs.soniox.com/stt/rt/stream-reconnect
export function openStream(url: string, apiKey: string, config: object, h: Handlers): Stream {
  let reconnectToken: string | null = null
  let reconnectUrl = ""
  let lastSeq = 0
  const unconfirmed = new Map<number, Message>()
  let count = 0
  let written = 0
  let ping: { id: number; written: number } | null = null
  let pingId = 0
  let pingTimer: ReturnType<typeof setInterval> | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let confirmedAt = Date.now()
  let live = false
  let ended = false

  const connect = (u: string) => {
    const s = new WebSocket(u, ["soniox-api-key", apiKey])
    s.binaryType = "arraybuffer"
    return s
  }
  const detach = (s: WebSocket) => { s.onopen = s.onmessage = s.onerror = s.onclose = null }
  const parse = (e: MessageEvent): Response | null => {
    try { return JSON.parse(e.data) } catch { return null }
  }
  const confirm = (upTo: number) => {
    for (const n of unconfirmed.keys()) {
      if (n > upTo) break
      unconfirmed.delete(n)
    }
  }
  const flush = () => {
    while (written < count) ws.send(unconfirmed.get(++written)!)
  }

  const end = () => {
    ended = true
    live = false
    clearInterval(pingTimer)
    clearTimeout(reconnectTimer)
    detach(ws)
    ws.close()
  }
  const fail = (e: Error) => {
    if (ended) return
    end()
    h.onError(e)
  }

  const onMessage = (e: MessageEvent) => {
    const msg = parse(e)
    if (!msg) return
    if (msg.type === "reconnect") {
      reconnectToken = msg.reconnect_token!
      reconnectUrl = msg.reconnect_url!
      pingTimer ??= setInterval(tick, QUARTER)
      return
    }
    if (msg.type === "pong") {
      if (ping?.id !== msg.id) return
      confirm(ping!.written)
      ping = null
      confirmedAt = Date.now()
      return
    }
    if (typeof msg.seq === "number") lastSeq = msg.seq
    if (msg.error_code) { fail(new Error(`soniox ${msg.error_code}: ${msg.error_message ?? ""}`)); return }
    h.onResponse(msg)
    if (msg.finished) fail(new Error("soniox stream finished"))
  }

  const adopt = (s: WebSocket) => {
    ws = s
    live = true
    ping = null
    confirmedAt = Date.now()
    s.onmessage = onMessage
    s.onerror = s.onclose = lost
    flush()
    h.onStatus("listening")
  }

  const tick = () => {
    if (!live) return
    if (ping) { lost(); return }
    ping = { id: ++pingId, written }
    ws.send(JSON.stringify({ type: "ping", id: ping.id }))
  }

  const lost = () => {
    if (ended || !live) return
    if (!reconnectToken) { fail(new Error("soniox connection lost")); return }
    live = false
    detach(ws)
    ws.close(4000)
    h.onStatus("reconnecting")
    attempt()
  }

  const attempt = () => {
    if (Date.now() > confirmedAt + IDLE_MS) { fail(new Error("soniox reconnect window closed")); return }
    const s = connect(reconnectUrl)
    ws = s
    const retry = () => {
      clearTimeout(reconnectTimer)
      detach(s)
      s.close(4000)
      reconnectTimer = setTimeout(attempt, 500)
    }
    reconnectTimer = setTimeout(retry, QUARTER)
    s.onopen = () => s.send(JSON.stringify({ type: "reconnect", reconnect_token: reconnectToken, last_seq: lastSeq }))
    s.onerror = s.onclose = retry
    s.onmessage = (e) => {
      const msg = parse(e)
      if (!msg) return
      clearTimeout(reconnectTimer)
      if (msg.type !== "reconnected") { fail(new Error(`soniox reconnect failed: ${msg.error_message ?? ""}`)); return }
      reconnectToken = msg.reconnect_token!
      written = msg.last_request!
      confirm(written)
      adopt(s)
    }
  }

  let ws = connect(url)
  ws.onerror = ws.onclose = () => fail(new Error("soniox connection failed"))
  ws.onopen = () => {
    ws.send(JSON.stringify({ ...config, enable_reconnect: true }))
    adopt(ws)
  }

  return {
    send(m) {
      if (ended) return
      unconfirmed.set(++count, m)
      if (live) flush()
    },
    close() {
      if (!ended) end()
    },
  }
}
