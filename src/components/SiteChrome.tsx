import Link from 'next/link';

/** Thumbnails and videos are stored separately; these tabs switch between the two lists. */
export function ProjectTabs({ current }: { current: 'thumbnails' | 'videos' }) {
  return (
    <nav className="pj-type-tabs" aria-label="Project type">
      <Link href="/projects" aria-current={current === 'thumbnails' ? 'page' : undefined}>Thumbnails</Link>
      <Link href="/projects/video" aria-current={current === 'videos' ? 'page' : undefined}>Videos</Link>
    </nav>
  );
}
