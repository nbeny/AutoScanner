import { describe, it, expect } from 'vitest';
import { isOsintEntry, type ScannerCatalogEntry } from '../scanner-catalog';

const entry = (p: Partial<ScannerCatalogEntry>): ScannerCatalogEntry =>
  ({
    name: 'x',
    displayName: 'x',
    description: '',
    categories: [],
    requiresCredential: null,
    fields: [],
    ...p,
  }) as ScannerCatalogEntry;

describe('isOsintEntry', () => {
  it('vrai quand primaryCategory est une catégorie OSINT', () => {
    expect(isOsintEntry(entry({ primaryCategory: 'osint' }))).toBe(true);
    expect(isOsintEntry(entry({ primaryCategory: 'breach-intel' }))).toBe(true);
  });
  it('faux pour une catégorie recon', () => {
    expect(isOsintEntry(entry({ primaryCategory: 'port-scan' }))).toBe(false);
  });
  it('fallback sur categories[0] si primaryCategory absent', () => {
    expect(isOsintEntry(entry({ categories: ['passive-recon'] }))).toBe(true);
    expect(isOsintEntry(entry({ categories: ['subdomain-enum', 'passive-recon'] }))).toBe(false);
  });
});
