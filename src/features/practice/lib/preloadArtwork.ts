/** Warm only upcoming artwork; never blocks navigation or starts media playback. */
const pending = new Map<string, Promise<void>>();
const artwork = ['/images/word-classroom.png', '/images/sentence-classroom.png'];

export function preloadStageArtwork(index: number) {
  const src = artwork[index];
  if (!src) return Promise.resolve();
  const existing = pending.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.onload = () => { void image.decode().catch(() => {}).then(resolve); };
    image.onerror = () => { pending.delete(src); resolve(); };
    image.src = src;
  });
  pending.set(src, promise);
  return promise;
}

export function scheduleStageArtwork() {
  // Let the current page finish before warming the next two screens in sequence.
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const begin = () => {
    timer = setTimeout(async () => {
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      if (connection?.saveData || connection?.effectiveType?.includes('2g')) return;
      for (let index = 0; index < 2 && !cancelled; index++) await preloadStageArtwork(index);
    }, 250);
  };
  if (document.readyState === 'complete') begin();
  else window.addEventListener('load', begin, { once: true });
  return () => { cancelled = true; clearTimeout(timer); window.removeEventListener('load', begin); };
}
