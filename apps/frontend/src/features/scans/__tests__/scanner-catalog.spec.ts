import { describe, expect, it } from 'vitest';
import { SCANNER_CATALOG, scannerCategory, ALL_SCANNER_NAMES } from '../scanner-catalog';

describe('scanner-catalog', () => {
  it('maps known scanners to a category', () => {
    expect(scannerCategory('nmap')).toBe('Ports/Network');
    expect(scannerCategory('nuclei')).toBe('Vuln/Exploit');
    expect(scannerCategory('subfinder')).toBe('DNS/Subdomains');
    expect(scannerCategory('sslscan')).toBe('TLS');
  });
  it('falls back to Other for unknown scanners', () => {
    expect(scannerCategory('totally-unknown')).toBe('Other');
  });
  it('lists all catalog scanner names (>= 50)', () => {
    expect(ALL_SCANNER_NAMES).toContain('nmap');
    expect(ALL_SCANNER_NAMES.length).toBeGreaterThanOrEqual(50);
    // no duplicates
    expect(new Set(ALL_SCANNER_NAMES).size).toBe(ALL_SCANNER_NAMES.length);
  });
  it('every catalog category is non-empty', () => {
    for (const [, names] of Object.entries(SCANNER_CATALOG)) {
      expect(names.length).toBeGreaterThan(0);
    }
  });
});
