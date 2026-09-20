import type { CalculatedScore } from './score';
import { abortable, ASSESSMENT_TIMEOUT_MS } from './assessmentRequest';
export type SpeechKind = 'word' | 'sentence' | 'speech';
export type SpeechResult = { id: string; provider: string; kind: SpeechKind; text: string; duration: number; result: Record<string, unknown>; scale: string; qualification: string; calculatedScore?: CalculatedScore; metrics?: Record<string, unknown> };
export async function toWav(blob: Blob, signal = AbortSignal.timeout(15_000)): Promise<Blob> {
  if (blob.size > 20_000_000) throw new Error('音频文件超过 20MB，请缩短录音。');
  const ctx = new AudioContext();
  try {
    const buffer = await abortable(() => blob.arrayBuffer(), signal);
    const decoded = await abortable(() => ctx.decodeAudioData(buffer), signal);
    if (decoded.duration < 0.3 || decoded.duration > 120) throw new Error('请使用 0.3–120 秒的录音。');
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
    const pcm = (await abortable(() => offline.startRendering(), signal)).getChannelData(0);
    const bytes = new ArrayBuffer(44 + pcm.length * 2); const view = new DataView(bytes);
    const str = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
    str(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    str(36, 'data'); view.setUint32(40, pcm.length * 2, true);
    pcm.forEach((s, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s)) * (s < 0 ? 32768 : 32767)), true));
    return new Blob([bytes], { type: 'audio/wav' });
  } finally { void ctx.close().catch(() => {}); }
}
export async function assessSpeech(kind: SpeechKind, text: string, blob: Blob, provider: 'speechace' | 'speechsuper' = 'speechsuper', options?: { signal?: AbortSignal; onPhase?: (phase: string) => void }): Promise<SpeechResult> {
  const signal = options?.signal ?? AbortSignal.timeout(ASSESSMENT_TIMEOUT_MS);
  options?.onPhase?.('正在处理录音…');
  let wav: Blob;
  try { wav = await toWav(blob, AbortSignal.any([signal, AbortSignal.timeout(15_000)])); }
  catch (error) {
    signal.throwIfAborted();
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new Error('录音处理超时，录音已保留，请重试或重新录音。');
    if (error instanceof DOMException) throw new Error('无法读取这段录音，请重新录音或换一个音频文件。');
    throw error;
  }
  const bytes = new Uint8Array(await abortable(() => wav.arrayBuffer(), signal)); let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  let response: Response;
  options?.onPhase?.('正在等待评测结果…');
  try { response = await abortable(() => fetch(`/api/${provider}/assess`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, text, audio: btoa(binary) }), signal }), signal); }
  catch { signal.throwIfAborted(); throw new Error('评测服务连接失败，录音已保留，请稍后重试。'); }
  let data;
  try { data = await abortable(() => response.json(), signal); } catch { signal.throwIfAborted(); throw new Error('评测服务返回异常，录音已保留，请稍后重试。'); }
  if (!response.ok) throw new Error(data.error?.message || data.detail || '评测服务暂不可用。');
  if (!data.result || typeof data.result !== 'object') throw new Error('评测返回不完整，请稍后重试。');
  return data;
}
