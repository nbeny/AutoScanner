import {
  evaluate,
  buildAudit,
  evalGuard,
  evalFilter,
  resolveCandidates,
  applyFilters,
  CATALOG_VERSION,
} from '../index';

describe('chain-engine barrel', () => {
  it('re-exports the public API', () => {
    expect(typeof evaluate).toBe('function');
    expect(typeof buildAudit).toBe('function');
    expect(typeof evalGuard).toBe('function');
    expect(typeof evalFilter).toBe('function');
    expect(typeof resolveCandidates).toBe('function');
    expect(typeof applyFilters).toBe('function');
    expect(CATALOG_VERSION).toBe('1.0.0');
  });
});
