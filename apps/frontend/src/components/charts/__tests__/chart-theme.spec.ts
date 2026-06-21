import { describe, expect, it } from 'vitest';
import { SEVERITY_COLORS, SEVERITY_ORDER } from '../chart-theme';

describe('chart-theme', () => {
  it('exposes a color for every severity in order', () => {
    expect(SEVERITY_ORDER).toEqual(['critical', 'high', 'medium', 'low', 'info']);
    for (const s of SEVERITY_ORDER) {
      expect(SEVERITY_COLORS[s]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
