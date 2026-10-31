import type { Metadata } from 'next';
import { getDemos } from '@/lib/demo-files';
import StudioLoader from '@/studio/StudioLoader';
import './studio.css';

export const metadata: Metadata = { title: 'Thumbnail' };

export default function StudioPage() {
  return <StudioLoader demos={getDemos()} />;
}
