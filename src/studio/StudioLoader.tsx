'use client';

import dynamic from 'next/dynamic';
import type { Demo } from '@/lib/demos';
import { StudioSplash } from './StudioSplash';

// The editor draws on <canvas> and reads IndexedDB, so it only runs in the browser.
const Studio = dynamic(() => import('./Studio'), { ssr: false, loading: () => <StudioSplash /> });

export default function StudioLoader({ demos }: { demos: Demo[] }) {
  return <Studio demos={demos} />;
}
