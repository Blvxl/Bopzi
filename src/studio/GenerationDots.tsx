'use client';

import { useEffect, useRef } from 'react';

/** Theme-tinted dots brighten along a soft diagonal band; the background and grid stay still. */
export default function GenerationDots({ running }: { running: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const phase = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 1, height = 1, frame = 0, previous = 0;
    const rawAccent = getComputedStyle(canvas).getPropertyValue('--color-ui-focus').trim();
    const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(rawAccent)?.[1];
    const expanded = hex?.length === 3 ? hex.split('').map(x => x + x).join('') : hex;
    const accent = expanded
      ? [0, 2, 4].map(i => parseInt(expanded.slice(i, i + 2), 16))
      : [149, 169, 255];
    const warm = [255, 128, 96];
    const palette = Array.from({ length: 101 }, (_, step) => {
      const warmth = step / 100 * 0.72;
      const color = accent.map((channel, i) => Math.round(channel * (1 - warmth) + warm[i] * warmth));
      return `rgb(${color[0]} ${color[1]} ${color[2]})`;
    });

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const t = phase.current;
      // A 5.5-second pass followed by a quiet second. The band leaves the frame
      // completely before restarting, so there is no jump in brightness.
      const cycle = t % 6.5;
      const progress = Math.min(cycle / 5.5, 1);
      const eased = 0.5 - Math.cos(progress * Math.PI) * 0.5;
      const extent = width + height * 0.45;
      const spread = Math.max(32, extent * 0.11);
      const center = -spread * 3 + eased * (extent + spread * 6);
      const spacing = 16;
      const startX = (width % spacing) / 2;
      const startY = (height % spacing) / 2;
      for (let y = startY; y < height; y += spacing) {
        for (let x = startX; x < width; x += spacing) {
          const shimmer = motion.matches || cycle >= 5.5 ? 0 : Math.exp(-Math.pow((x + y * 0.45 - center) / spread, 2));
          context.fillStyle = palette[Math.round(shimmer * 100)];
          context.globalAlpha = 0.2 + shimmer * 0.8;
          const radius = 1.15 + shimmer * 1.25;
          context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
        }
      }
      context.globalAlpha = 1;
    };

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      width = box.width; height = box.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };
    const animate = (now: number) => {
      phase.current += previous ? Math.min((now - previous) / 1000, 0.05) : 0;
      previous = now;
      draw();
      frame = requestAnimationFrame(animate);
    };
    const update = () => {
      cancelAnimationFrame(frame); previous = 0;
      if (running && !motion.matches && !document.hidden) frame = requestAnimationFrame(animate);
      else draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize(); update();
    motion.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      motion.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [running]);

  return <canvas ref={ref} className="gen-dot-grid" aria-hidden="true" />;
}
