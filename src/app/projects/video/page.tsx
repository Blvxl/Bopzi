import type { Metadata } from 'next';
import { ProjectTabs } from '@/components/SiteChrome';
import VideoProjectsList from '../VideoProjectsList';
import '../projects.css';

export const metadata: Metadata = { title: 'Video projects' };

export default function VideoProjectsPage() {
  return <div className="site pj"><main className="wrap"><ProjectTabs current="videos"/><VideoProjectsList/></main></div>;
}
