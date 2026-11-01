/**
 * Fetches an image without following redirects. `redirect: 'error'` is not available on every host (Cloudflare
 * refuses it), so redirects are left alone ('manual') and turned into an error here instead.
 */
export async function fetchImage(url: string, signal: AbortSignal) {
  const response = await fetch(url, { redirect: 'manual', signal });
  if (response.status >= 300 && response.status < 400) throw new Error('The image moved, so it was not followed.');
  return response;
}
