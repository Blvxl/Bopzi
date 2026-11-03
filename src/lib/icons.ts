// Game icons come from Roblox's thumbnail service. They rarely change, so they are remembered for a few minutes.
const cache = new Map<number, { url: string; at: number }>();

/** Looks up icons for many games at once and returns a function that gives one game's icon (or null). */
export async function icons(ids: number[]) {
  const need = ids.filter((id) => Date.now() - (cache.get(id)?.at ?? 0) > 10 * 60e3);
  for (let i = 0; i < need.length; i += 50) {
    try {
      const res = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${need.slice(i, i + 50).join(',')}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`);
      if (!res.ok) continue;
      const body = await res.json() as { data?: { targetId: number; imageUrl?: string }[] };
      for (const d of body.data ?? []) if (d.imageUrl) cache.set(d.targetId, { url: d.imageUrl, at: Date.now() });
    } catch { /* the cards show an initial instead */ }
  }
  return (id: number) => cache.get(id)?.url ?? null;
}
