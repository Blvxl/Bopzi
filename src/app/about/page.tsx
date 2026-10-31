import Link from 'next/link';
import type { Metadata } from 'next';
import './privacy.css';

export const metadata: Metadata = { title: 'Privacy & usage' };

export default function About() {
  return <main className="about-page"><Link href="/" className="about-back">← Back to Bopzi</Link><h1>Privacy &amp; usage</h1><p className="about-intro">How this local version of Bopzi works and what to consider when you create.</p>
    <section><h2>Your projects</h2><p>Thumbnail and icon projects are saved in this browser on this computer. Clearing browser data can remove them; export work you want to keep. Bopzi does not provide cloud project sync.</p></section>
    <section><h2>AI and external services</h2><p>When you use AI, your prompt and any attached images are sent to OpenAI. The local server reads your Codex session to make these requests. Generation uses an undocumented connection whose availability can change. Your account and OpenAI’s terms and usage limits apply.</p><p>Looking up Roblox avatars or browsing Roblox inspiration contacts Roblox services. Your browser may also request fonts and other resources used by the app. Manual canvas editing does not require AI.</p></section>
    <section><h2>Use on your own computer</h2><p>Bopzi is designed for a trusted local machine, not as a public server. Do not share your Codex sign-in or expose Bopzi’s local server to the internet. Only connect the optional local helper to websites you trust.</p></section>
    <section><h2>Your content and third-party rights</h2><p>Use images, names, characters, logos, likenesses and other material only when you have the rights or permission needed for your use. Review generated images before publishing. Bopzi cannot determine whether a particular image is cleared for your use.</p></section>
    <section><h2>Independence and licenses</h2><p>Bopzi is independent and is not affiliated with, endorsed by, or sponsored by Roblox Corporation. Roblox is a trademark of Roblox Corporation. Bopzi’s source code is offered under the <Link href="/license">MIT License</Link>, without warranty; third-party assets and dependencies may have separate terms.</p></section>
  </main>;
}
