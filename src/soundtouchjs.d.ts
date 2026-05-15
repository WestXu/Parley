declare module "soundtouchjs" {
  class FifoSampleBuffer {
    readonly frameCount: number
    putSamples(samples: Float32Array, position?: number, numFrames?: number): void
    receiveSamples(output: Float32Array, numFrames?: number): void
  }
  class Stretch {
    readonly inputChunkSize: number
    setParameters(sampleRate: number, sequenceMs: number, seekWindowMs: number, overlapMs: number): void
  }
  export class SoundTouch {
    tempo: number
    readonly stretch: Stretch
    readonly inputBuffer: FifoSampleBuffer
    readonly outputBuffer: FifoSampleBuffer
    process(): void
  }
}
