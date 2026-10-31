import type { Metadata } from 'next';
import VideoEditor from '@/video/VideoEditor';
import './video.css';
import './ai-layout.css';
export const metadata: Metadata = { title: 'Video Studio', description: 'Turn gameplay into trailers with an editable timeline, titles, audio and an AI editing assistant.', robots: { index: false, follow: false } };
export default function VideoPage() { return <VideoEditor />; }
