/**
 * Roblox answers some requests from shared hosting addresses with "too many requests" or a short outage, and
 * the next try usually works. This asks again a couple of times before giving up; the caller's own time limit
 * still covers all tries together.
 */
const WAITS = [400, 1200];

export async function robloxFetch(url: string, init: RequestInit = {}) {
  let last: Response | null = null;
  let failure: unknown;
  for (let attempt = 0; attempt <= WAITS.length; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status !== 429 && response.status < 500) return response;
      last = response;
    } catch (error) {
      if (init.signal?.aborted) throw error;
      failure = error;
    }
    if (attempt < WAITS.length) await new Promise((resolve) => setTimeout(resolve, WAITS[attempt] + Math.random() * 200));
  }
  if (last) return last;
  throw failure;
}
