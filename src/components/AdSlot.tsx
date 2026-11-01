'use client';

import { useEffect, useState } from 'react';
import { ADSENSE_CLIENT, ADSENSE_SLOT } from '@/lib/site';

type Choice = 'yes' | 'no' | null;
const KEY = 'bopzi-ads';
const read = (): Choice => { try { const v = localStorage.getItem(KEY); return v === 'yes' || v === 'no' ? v : null; } catch { return null; } };

/** One ad on the public pages, shown only after the visitor agrees. The editor never shows ads. */
export default function AdSlot() {
  const [choice, setChoice] = useState<Choice>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setChoice(read()); setReady(true); }, []);
  useEffect(() => {
    if (choice !== 'yes' || !ADSENSE_CLIENT || !ADSENSE_SLOT) return;
    if (!document.querySelector('script[data-bopzi-ads]')) {
      const s = document.createElement('script');
      s.async = true; s.crossOrigin = 'anonymous'; s.dataset.bopziAds = '1';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
      document.head.appendChild(s);
    }
    try { ((window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle ??= []).push({}); } catch { /* the ad simply stays empty */ }
  }, [choice]);

  if (!ADSENSE_CLIENT || !ADSENSE_SLOT || !ready || choice === 'no') return null;
  const pick = (value: 'yes' | 'no') => { try { localStorage.setItem(KEY, value); } catch { /* the choice lasts until the page closes */ } setChoice(value); };
  if (choice === null) return (
    <aside className="home-ads-consent" aria-label="Ads">
      <p>Bopzi is free. Allow ads on this page to help keep it that way? Ads load from Google and may use cookies.</p>
      <div><button type="button" onClick={() => pick('yes')}>Allow ads</button><button type="button" onClick={() => pick('no')}>No thanks</button></div>
    </aside>
  );
  return <aside className="home-ad" aria-label="Advertisement"><ins className="adsbygoogle" style={{ display: 'block' }} data-ad-client={ADSENSE_CLIENT} data-ad-slot={ADSENSE_SLOT} data-ad-format="auto" data-full-width-responsive="true" /></aside>;
}
