import { describe, expect, it, vi } from 'vitest';
import { renderHook, fireEvent } from '@testing-library/react';
import { useTriageKeyboard } from '../use-triage-keyboard';

describe('useTriageKeyboard', () => {
  it('calls onNext on "j" and onPrev on "k"', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    renderHook(() => useTriageKeyboard({ onNext, onPrev, onStatus: vi.fn() }));
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'k' });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('maps c/f/r/t to status changes', () => {
    const onStatus = vi.fn();
    renderHook(() => useTriageKeyboard({ onNext: vi.fn(), onPrev: vi.fn(), onStatus }));
    fireEvent.keyDown(window, { key: 'c' });
    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 't' });
    expect(onStatus).toHaveBeenNthCalledWith(1, 'CONFIRMED');
    expect(onStatus).toHaveBeenNthCalledWith(2, 'FALSE_POSITIVE');
    expect(onStatus).toHaveBeenNthCalledWith(3, 'RESOLVED');
    expect(onStatus).toHaveBeenNthCalledWith(4, 'TRIAGED');
  });

  it('ignores keys while a textarea is focused', () => {
    const onStatus = vi.fn();
    renderHook(() => useTriageKeyboard({ onNext: vi.fn(), onPrev: vi.fn(), onStatus }));
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    fireEvent.keyDown(ta, { key: 'c' });
    expect(onStatus).not.toHaveBeenCalled();
    ta.remove();
  });
});
