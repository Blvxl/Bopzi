'use client';

import Link from 'next/link';
import { ArrowUp, ImagePlus, Layers2 } from 'lucide-react';
import { useEffect, useState } from 'react';

const EXAMPLES = [
  { src: '/showcase/home-car-obby.png', alt: 'A Roblox avatar drives a white car through a colourful obstacle course', prompt: 'A player drives a white car through a rainbow obby' },
  { src: '/showcase/home-monster-ride.png', alt: 'A Roblox avatar rides a running monster across a grassy landscape', prompt: 'My avatar rides a monster across a grassy world' },
  { src: '/showcase/home-football-card.png', alt: 'A surprised Roblox avatar points at a Dembélé football card', prompt: 'My avatar finds a rare football player card' },
];

export default function HomeShowcase() {
  const [front, setFront] = useState(1);
  const [placeholder, setPlaceholder] = useState(EXAMPLES[1].prompt);
  const [focused, setFocused] = useState(false);
  const [controlsFocused, setControlsFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  // Signed-in creators get the prompt box; everyone else is pointed at pricing.
  useEffect(() => {
    fetch('/api/access', { cache: 'no-store' }).then((r) => r.json()).then((a: { signedIn?: boolean }) => setSignedIn(!!a.signedIn)).catch(() => setSignedIn(false));
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    const visibility = () => setVisible(!document.hidden);
    update(); visibility();
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    return () => { media.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (focused || controlsFocused || hovered || reduced || !visible) return;
    const timer = window.setInterval(() => setFront(i => (i + 1) % EXAMPLES.length), 7000);
    return () => window.clearInterval(timer);
  }, [front, focused, controlsFocused, hovered, reduced, visible]);
  useEffect(() => {
    const text = EXAMPLES[front].prompt;
    if (reduced || focused || controlsFocused || hovered || !visible) { setPlaceholder(text); return; }
    let index = 0;
    setPlaceholder('');
    const timer = window.setInterval(() => {
      index += 1;
      setPlaceholder(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 30);
    return () => window.clearInterval(timer);
  }, [front, focused, controlsFocused, hovered, reduced, visible]);

  return <>
    <section className="home-hero" aria-labelledby="home-title">
      <h1 id="home-title">Roblox thumbnails <br/>that get the <em>click.</em></h1>
      <p>Describe your game and Bopzi draws it with your own ChatGPT plan. Finish it with text and layers, in your browser.</p>
      {signedIn ? <>
        <form className="home-prompt" action="/studio" method="get">
          <input type="hidden" name="auto" value="1"/>
          <label className="sr-only" htmlFor="home-idea">Your idea</label>
          <input id="home-idea" name="idea" maxLength={4000} autoComplete="off" placeholder={placeholder} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
          <button type="submit" aria-label="Start"><ArrowUp size={19} strokeWidth={2.4}/></button>
        </form>
        <div className="home-starts"><Link href="/studio?start=screenshot"><ImagePlus size={16}/> Use a screenshot</Link><Link href="/studio?start=canvas"><Layers2 size={16}/> Blank canvas</Link></div>
      </> : <div className="home-cta"><Link href="/pricing" className="home-cta-main">Get started</Link><Link href="/studio" className="home-cta-alt">Log in</Link></div>}
    </section>
    <section className="home-stage-wrap" aria-label="Example thumbnails" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="home-stage">
        {EXAMPLES.map((example, i) => {
          const position = i === front ? 'is-front' : i === (front + EXAMPLES.length - 1) % EXAMPLES.length ? 'is-left' : 'is-right';
          return <figure key={example.src} className={position} aria-hidden={position !== 'is-front'}><img src={example.src} alt={example.alt} width={1920} height={1080} decoding="async" fetchPriority="high"/></figure>;
        })}
      </div>
      <div className="home-stage-controls" role="group" aria-label="Choose a thumbnail example" onFocusCapture={() => setControlsFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setControlsFocused(false); }}>
        <div className="home-stage-dots">
          {EXAMPLES.map((example, i) => <button key={example.src} type="button" className={i === front ? 'is-active' : ''} aria-label={`Show example ${i + 1}: ${example.alt}`} aria-current={i === front ? 'true' : undefined} onClick={() => setFront(i)}><span /></button>)}
        </div>
      </div>
    </section>
  </>;
}
