import type { Metadata } from 'next';
import EvalRunner from '@/video/EvalRunner';
import './eval.css';
export const metadata: Metadata = { title: 'Video AI eval', description: 'Scores the video AI on thirty everyday edit requests.', robots: { index: false, follow: false } };
export default function VideoEvalPage() { return <EvalRunner />; }
