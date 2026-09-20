/** Acceptance presentation only; never writes passing assessment records. */
export function isOpenPreview() {
  return (
    typeof window !== 'undefined' &&
    (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) ||
      import.meta.env.VITE_PUBLIC_TEST === 'true') &&
    new URLSearchParams(window.location.search).get('test') === 'acceptance'
  );
}
