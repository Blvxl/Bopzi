import { Mark } from '@/components/Logo';

export function StudioSplash({ label = 'Opening the studio…' }: { label?: string }) {
  return (
    <div className="studio-splash grid min-h-dvh place-items-center text-ui-dim">
      <div className="grid justify-items-center gap-3">
        <Mark size={36} bg="#111110" className="text-ui-fg" />
        <span className="flex items-center gap-2 text-[13px]" role="status">
          <i className="spinner" /> {label}
        </span>
      </div>
    </div>
  );
}
