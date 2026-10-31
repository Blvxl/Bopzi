import Link from 'next/link';
import './home.css';
import HomeShowcase from './HomeShowcase';

const FAQ = [
  { q: 'What do I need?', a: 'An approved Bopzi account. After signing in, connect your own ChatGPT/Codex account for AI images. Windows is the tested platform so far.' },
  { q: 'What does it cost?', a: 'Bopzi access is offered to approved creators under a separate 5% game-revenue-share agreement. AI images count against your own ChatGPT plan.' },
  { q: 'Can I use it without AI?', a: 'You still sign in, but a blank canvas, your own screenshots and every manual tool work on any ChatGPT plan.' },
  { q: 'Where do my projects go?', a: 'They stay in this browser on this computer. Prompts and reference images are sent to OpenAI only when you generate. Export anything you want to keep.' },
];

export default function Home() {
  return <div className="home"><main>
    <HomeShowcase />

    <section className="home-faq" aria-labelledby="faq-title">
      <h2 id="faq-title">Good to know.</h2>
      <div>{FAQ.map(f => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
    </section>

    <footer className="home-footer"><div className="home-legal"><p>Bopzi is independent and not affiliated with or endorsed by Roblox Corporation. Roblox is a trademark of Roblox Corporation.</p><p>Use only content you have the rights or permission to use.</p></div><nav aria-label="Legal and privacy"><Link href="/license">Licensing</Link><Link href="/about">Privacy &amp; usage</Link></nav></footer>
  </main></div>;
}
