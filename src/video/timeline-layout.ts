/** Display-only interval packing, including minimum-width short blocks. */
export function packTimelineRows(items: { id: string; start: number; duration: number }[], pixelsPerSecond: number, preferred: ReadonlyMap<string, number> = new Map(), pinned?: string) {
  const occupied: { start: number; end: number }[][] = [], rows = new Map<string, number>();
  // Reserve the item under the pointer first. Sorting only by time made it
  // change rows whenever its start crossed a neighbour's start during a drag.
  const ordered = [...items].sort((a, b) => Number(b.id === pinned) - Number(a.id === pinned) || Number(preferred.has(b.id)) - Number(preferred.has(a.id)) || a.start - b.start || a.id.localeCompare(b.id));
  for (const item of ordered) {
    const start = item.start * pixelsPerSecond, end = start + Math.max(6, item.duration * pixelsPerSecond);
    const free = (row: number) => !(occupied[row] ?? []).some(other => start < other.end - 1e-7 && end > other.start + 1e-7);
    let row = preferred.get(item.id);
    if (row === undefined || !free(row)) { row = 0; while (!free(row)) row++; }
    (occupied[row] ??= []).push({ start, end }); rows.set(item.id, row);
  }
  return { rows, count: Math.max(1, occupied.length) };
}
