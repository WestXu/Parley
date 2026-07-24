const VOICES = ["Noah", "Maya", "Nina", "Jack", "Grace", "Daniel", "Emma"]

export const voiceFor = (speaker: number): string => {
  const i = Number.isFinite(speaker) && speaker >= 1 ? speaker - 1 : 0
  return VOICES[i % VOICES.length]!
}
