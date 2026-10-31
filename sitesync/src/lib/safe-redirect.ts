/** Only allow same-origin relative paths to prevent open redirects. */
export function safeNext(next: string | null | undefined, fallback = '/') {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}
