'use client';

import { ArrowDownToLine } from 'lucide-react';
import { useEffect, useState } from 'react';

type Update = { version: string; progress: number | null } | null;
declare global {
  interface Window { bopziUpdate?: { get: () => Promise<Update>; install: () => Promise<void>; listen: (callback: (state: Update) => void) => () => void } }
}

/** Shows up in the top bar when the desktop app has a new version. One click downloads and installs it. */
export default function UpdateButton() {
  const [update, setUpdate] = useState<Update>(null);
  useEffect(() => {
    const bridge = window.bopziUpdate;
    if (!bridge) return;
    let alive = true;
    bridge.get().then((state) => { if (alive) setUpdate(state); }).catch(() => undefined);
    const stop = bridge.listen(setUpdate);
    return () => { alive = false; stop(); };
  }, []);
  if (!update) return null;
  const busy = update.progress !== null;
  return (
    <button type="button" className="update-button" disabled={busy} title={`Bopzi ${update.version} is available`} onClick={() => void window.bopziUpdate?.install()}>
      <ArrowDownToLine size={14} aria-hidden="true" />
      {busy ? `Downloading ${Math.round((update.progress ?? 0) * 100)}%` : 'Update'}
    </button>
  );
}
