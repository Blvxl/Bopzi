type MarkProps = { size?: number; className?: string; /** Colour behind the mark, used to cut the cursor out of the frames. */ bg?: string };

/** The brand mark: two stacked frames, a cursor and a click burst. */
export function Mark({ size = 34, className, bg = 'var(--color-night)' }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true" fill="none">
      <g transform="rotate(-9 32 32)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 25h-4a6 6 0 0 0-6 6v19a6 6 0 0 0 6 6h24a6 6 0 0 0 6-6v-3" stroke="currentColor" strokeWidth="7" />
        <path d="M48 12H28a6 6 0 0 0-6 6v18a6 6 0 0 0 6 6h3" stroke="var(--color-signal)" strokeWidth="7" />
        <path d="M33 24l20.500 9.500-8.700 3 5.400 9.800-5.200 2.900-5.400-9.800-6.600 6.400z" fill="currentColor" stroke={bg} strokeWidth="2.500" paintOrder="stroke" />
      </g>
      <g stroke="var(--color-signal)" strokeWidth="4" strokeLinecap="round">
        <path d="M50 9l2-6M56 14l5-4M58 21l6-1" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold leading-none tracking-[-0.06em] ${className}`}>
      bopzi<span className="text-signal">.</span>
    </span>
  );
}

export function Lockup({ size = 34, className = '', bg }: { size?: number; className?: string; bg?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark size={size} bg={bg} />
      <Wordmark className="text-[1.625rem]" />
    </span>
  );
}

/** The layered-frames motif on its own, for quiet brand details. */
export function Frames({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <g transform="rotate(-9 32 32)">
        <path d="M20 25h-4a6 6 0 0 0-6 6v19a6 6 0 0 0 6 6h24a6 6 0 0 0 6-6v-3" stroke="currentColor" strokeWidth="3" />
        <path d="M48 12H28a6 6 0 0 0-6 6v18a6 6 0 0 0 6 6h14a6 6 0 0 0 6-6V12z" stroke="var(--color-signal)" strokeWidth="3" />
      </g>
    </svg>
  );
}
