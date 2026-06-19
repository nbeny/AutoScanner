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
}: {
  onNext: () => void;
  onPrev: () => void;
  onStatus: (status: string) => void;
}) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'j') {
        e.preventDefault();
        onNext();
      } else if (e.key === 'k') {
        e.preventDefault();
        onPrev();
      } else if (STATUS_KEYS[e.key]) {
        e.preventDefault();
        onStatus(STATUS_KEYS[e.key]);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNext, onPrev, onStatus]);
}
