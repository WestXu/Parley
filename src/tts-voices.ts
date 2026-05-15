const VOICES = ["Adrian", "Maya", "Noah", "Nina", "Jack", "Grace", "Daniel", "Emma"]

export const voiceFor = (speaker: number): string => {
  const i = Number.isFinite(speaker) ? speaker : 0
  return VOICES[((i % VOICES.length) + VOICES.length) % VOICES.length]!
}
