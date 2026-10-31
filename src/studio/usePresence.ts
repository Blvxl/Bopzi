'use client';

import { useEffect, useState } from 'react';

/** Keeps a closing panel mounted for its exit transition, then removes it. */
export function usePresence<T>(value: T | null) {
  const [retained, setRetained] = useState<T | null>(value);
  useEffect(() => {
    if (value !== null) { setRetained(value); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setRetained(null); return; }
    const timer = setTimeout(() => setRetained(null), 160);
    return () => clearTimeout(timer);
  }, [value]);
  return { rendered: value ?? retained, exiting: value === null && retained !== null };
}
