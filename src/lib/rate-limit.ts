/**
 * A best-effort limit per caller. It lives in this server's memory, so on a host that runs several copies
 * each one counts on its own; the host's firewall rule is the real limit. This only stops a loop in a tab.
 */
const hits = new Map<string, number[]>();

export function tooMany(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return recent.length > max;
}

/**
 * Who is calling. Cloudflare sets cf-connecting-ip itself, so it cannot be faked by the caller; x-forwarded-for
 * can be, so it is never used. Anywhere else (a laptop, an unknown host) everyone shares one bucket.
 */
export const callerOf = (req: Request) => (req.headers.get('cf-connecting-ip') ?? '').trim() || 'unknown';
