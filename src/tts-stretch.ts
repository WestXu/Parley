import { SoundTouch } from "soundtouchjs"

// Pitch-preserving time-stretch. Both TTS paths feed it mono PCM and play back
// the (shorter) result at native rate. SoundTouchJS only processes interleaved
// stereo, so the mono <-> stereo glue is contained here.
export type Stretcher = {
  push: (mono: Float32Array) => Float32Array
  flush: () => Float32Array
}

export function makeStretcher(speed: number, sampleRate: number): Stretcher {
  const st = new SoundTouch()
  st.tempo = speed
  st.stretch.setParameters(sampleRate, 0, 0, 0)

  const drain = (): Float32Array => {
    const frames = st.outputBuffer.frameCount
    if (!frames) return new Float32Array(0)
    const stereo = new Float32Array(frames * 2)
    st.outputBuffer.receiveSamples(stereo, frames)
    const mono = new Float32Array(frames)
    for (let i = 0; i < frames; i++) mono[i] = stereo[i * 2] ?? 0
    return mono
  }

  const feed = (mono: Float32Array) => {
    const stereo = new Float32Array(mono.length * 2)
    for (let i = 0; i < mono.length; i++) {
      const s = mono[i] ?? 0
      stereo[i * 2] = s
      stereo[i * 2 + 1] = s
    }
    st.inputBuffer.putSamples(stereo, 0, mono.length)
    st.process()
  }

  return {
    push(mono) {
      if (!mono.length) return new Float32Array(0)
      feed(mono)
      return drain()
    },
    // SoundTouch holds back a partial chunk; pad with silence to push the real
    // tail through, then drop the trailing zeros it produced.
    flush() {
      feed(new Float32Array(st.stretch.inputChunkSize * 3))
      const out = drain()
      let end = out.length
      while (end > 0 && out[end - 1] === 0) end--
      return out.subarray(0, end)
    },
  }
}
