import { useEffect } from 'react';

const STATUS_KEYS: Record<string, string> = {
  c: 'CONFIRMED',
  f: 'FALSE_POSITIVE',
  r: 'RESOLVED',
  t: 'TRIAGED',
};

export function useTriageKeyboard({
  onNext,
  onPrev,
  onStatus,
  onEditNote,
}: {
  onNext: () => void;
  onPrev: () => void;
  onStatus: (status: string) => void;
  onEditNote?: () => void;
}) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || !!target?.isContentEditable;

      // Esc leaves editing: blur the focused field.
      if (e.key === 'Escape') {
        if (inField && target) {
          e.preventDefault();
          target.blur();
        }
        return;
      }

      if (inField) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'j') {
        e.preventDefault();
        onNext();
      } else if (e.key === 'k') {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onEditNote?.();
      } else if (STATUS_KEYS[e.key]) {
        e.preventDefault();
        onStatus(STATUS_KEYS[e.key]);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNext, onPrev, onStatus, onEditNote]);
}
