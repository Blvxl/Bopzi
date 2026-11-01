import type { Metadata } from 'next';
import ProjectsList from './ProjectsList';
import './projects.css';
export const metadata: Metadata = { title: 'Projects', robots: { index: false, follow: false } };
export default function ProjectsPage() {
  return <div className="site pj"><main className="wrap"><ProjectsList/></main></div>;
}
