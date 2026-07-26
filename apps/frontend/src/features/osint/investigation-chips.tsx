import { SEED_TYPE_LABEL } from './detect-seed-type';
import type { InvestigationFocus } from './seed-match';

export interface InvestigationChipsProps {
  investigations: InvestigationFocus[];
  focus: InvestigationFocus | null;
  onFocus: (focus: InvestigationFocus | null) => void;
}

export function InvestigationChips({ investigations, focus, onFocus }: InvestigationChipsProps) {
  if (investigations.length === 0) return null;

  return (
    <div aria-label="investigation-chips" className="flex flex-wrap items-center gap-2">
      <Chip label="Toutes" active={focus === null} onClick={() => onFocus(null)} />
      {investigations.map((inv) => (
        <Chip
          key={`${inv.seedType}:${inv.seed}`}
          label={`${SEED_TYPE_LABEL[inv.seedType]} · ${inv.seed}`}
          active={focus?.seed === inv.seed && focus?.seedType === inv.seedType}
          onClick={() => onFocus(inv)}
        />
      ))}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-0.5 text-xs transition-colors ${
        active
          ? 'border-neon-magenta/60 bg-neon-magenta/15 text-neon-magenta'
          : 'border-space-800 text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );
}
