const TARGET_RATE = 16000
const BATCH = 800

class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / TARGET_RATE
    this.pos = 0
    this.tail = new Float32Array(0)
    this.batch = new Int16Array(BATCH)
    this.batchPos = 0
  }

  flush() {
    const out = this.batch
    this.batch = new Int16Array(BATCH)
    this.batchPos = 0
    this.port.postMessage(out, [out.buffer])
  }

  pushSample(f) {
    const c = f < -1 ? -1 : f > 1 ? 1 : f
    this.batch[this.batchPos++] = (c * 0x7fff) | 0
    if (this.batchPos === BATCH) this.flush()
  }

  process(inputs) {
    const ch = inputs[0]?.[0]
    if (!ch) return true

    if (this.ratio === 1) {
      for (let i = 0; i < ch.length; i++) this.pushSample(ch[i])
      return true
    }

    const merged = new Float32Array(this.tail.length + ch.length)
    merged.set(this.tail, 0)
    merged.set(ch, this.tail.length)

    let p = this.pos
    while (p < merged.length) {
      this.pushSample(merged[p | 0])
      p += this.ratio
    }
    const consumed = p | 0
    this.tail = merged.subarray(consumed)
    this.pos = p - consumed
    return true
  }
}

registerProcessor("pcm-worklet", PcmWorklet)
