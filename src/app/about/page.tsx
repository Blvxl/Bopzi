import Link from 'next/link';
import type { Metadata } from 'next';
import './privacy.css';

export const metadata: Metadata = { title: 'Privacy & usage' };

export default function About() {
  return <main className="about-page"><Link href="/" className="about-back">← Back to Bopzi</Link><h1>Privacy &amp; usage</h1><p className="about-intro">How Bopzi works in your browser and what to consider when you create.</p>
    <section><h2>Your projects</h2><p>Thumbnail and icon projects are saved in this browser. Clearing browser data can remove them; export work you want to keep. Bopzi does not provide cloud project sync.</p></section>
    <section><h2>AI and external services</h2><p>When you use AI, your prompt and any attached images are sent to OpenAI. Requests are made through your own ChatGPT account. Availability of AI generation can change. Your account and OpenAI’s terms and usage limits apply.</p><p>Looking up Roblox avatars or browsing Roblox inspiration contacts Roblox services. Your browser may also request fonts and other resources used by the app. Manual canvas editing does not require AI.</p></section>
    <section><h2>Ads and support</h2><p>The public pages (home and pricing) may show one ad from Google, only if you allow it, and may link to a page where you can support Bopzi. The editor never shows ads. You can say no and everything still works.</p></section>
    <section><h2>Your account and e-mail</h2><p>To log in, Bopzi stores your e-mail address and a protected form of your password (or your Google sign-in) with our sign-in provider, Supabase, in the EU. We use it only to let you log in and to e-mail you about your account. Your key and your ChatGPT sign-in are yours alone. Do not share them, and log out on computers you do not own. You can delete your account yourself on the account page, which removes your e-mail and login.</p></section>
    <section><h2>The helper</h2><p>AI images are made by a small helper program that you run on your own computer. It uses your ChatGPT sign-in there, and your prompt and images are sent from your computer to OpenAI. Bopzi does not store your ChatGPT sign-in.</p></section>
    <section><h2>Your content and third-party rights</h2><p>Use images, names, characters, logos, likenesses and other material only when you have the rights or permission needed for your use. Review generated images before publishing. Bopzi cannot determine whether a particular image is cleared for your use.</p></section>
    <section><h2>Independence and licenses</h2><p>Bopzi is independent and is not affiliated with, endorsed by, or sponsored by Roblox Corporation. Roblox is a trademark of Roblox Corporation. See <Link href="/license">licensing</Link> for the status of Bopzi’s terms; third-party assets and dependencies may have separate terms.</p></section>
  </main>;
}
