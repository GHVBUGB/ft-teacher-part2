export type Clip = {
  blob: Blob;
  url: string;
  duration: number;
  rms: number;
  source: 'microphone' | 'sample';
};
export async function inspectAudio(blob: Blob) {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const d = decoded.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
    return { duration: decoded.duration, rms: Math.sqrt(sum / d.length) };
  } finally {
    await ctx.close();
  }
}
export async function sampleAudio(id: string, silent = false): Promise<Clip> {
  const response = await fetch(`/samples/${silent ? 'silence' : id}.wav`);
  if (!response.ok) throw new Error('示例音频未能载入，请重试。');
  const blob = await response.blob();
  return {
    blob,
    url: URL.createObjectURL(blob),
    ...(await inspectAudio(blob)),
    source: 'sample',
  };
}
