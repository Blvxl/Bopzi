'use client';

import Pulse from '@/components/Pulse';
import { useOverview } from '@/components/useOverview';

/** The whole live feed. */
export default function PulsePage() {
  const data = useOverview(200);
  return (
    <main className="wrap">
      <div className="page-head"><div><h1>Pulse</h1><p>Milestones, new highs, updates and new games as they happen.</p></div></div>
      <Pulse events={data?.pulse ?? []} live all />
    </main>
  );
}
