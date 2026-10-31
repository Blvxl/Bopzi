import Link from 'next/link';
import './home.css';
import HomeShowcase from './HomeShowcase';

const FAQ = [
  { q: 'What do I need?', a: 'Bopzi and Node.js 20.9 or newer. For AI images, you also need Codex signed in to a ChatGPT account with access. Windows is the tested platform so far.' },
  { q: 'What does it cost?', a: 'Bopzi is free. AI images count against your own ChatGPT plan, and nothing is paid to Bopzi.' },
  { q: 'Can I use it without AI?', a: 'Yes. A blank canvas, your own screenshots and every manual tool work with no connection at all.' },
  { q: 'Where do my projects go?', a: 'They stay in this browser on this computer. Prompts and reference images are sent to OpenAI only when you generate. Export anything you want to keep.' },
];

export default function Home() {
  return <div className="home"><main>
    <HomeShowcase />

    <section className="home-faq" aria-labelledby="faq-title">
      <h2 id="faq-title">Good to know.</h2>
      <div>{FAQ.map(f => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
    </section>

    <footer className="home-footer"><div className="home-legal"><p>Bopzi is independent and not affiliated with or endorsed by Roblox Corporation. Roblox is a trademark of Roblox Corporation.</p><p>Bopzi is provided “as is” under the MIT License, without warranty. Use only content you have the rights or permission to use.</p></div><nav aria-label="Legal and privacy"><Link href="/license">MIT License</Link><Link href="/about">Privacy &amp; usage</Link></nav></footer>
  </main></div>;
}
