import { structuralFindingHash } from '../structural-finding-hash';

const BASE = { assetCanonical: 'h.com', location: '443' };

describe('structuralFindingHash', () => {
  describe('CVE merge', () => {
    it('two different scanners with the same cveId + asset + location produce the same hash', () => {
      const a = structuralFindingHash({
        ...BASE,
        scannerName: 'nuclei',
        cveId: 'CVE-2021-1234',
        title: 'X',
      });
      const b = structuralFindingHash({
        ...BASE,
        scannerName: 'nikto',
        cveId: 'CVE-2021-1234',
        title: 'Y',
      });
      expect(a.hash).toBe(b.hash);
    });

    it('CVE result has category === null', () => {
      const result = structuralFindingHash({
        ...BASE,
        scannerName: 'nuclei',
        cveId: 'CVE-2021-1234',
        title: 'X',
      });
      expect(result.category).toBeNull();
    });
  });

  describe('Category merge', () => {
    it('two different scanners with category-matched titles produce the same hash', () => {
      const a = structuralFindingHash({
        ...BASE,
        scannerName: 'tlsx',
        title: 'Weak TLS version: tls10',
      });
      const b = structuralFindingHash({
        ...BASE,
        scannerName: 'sslscan',
        title: 'Weak SSL/TLS protocol enabled: SSLv3',
      });
      expect(a.hash).toBe(b.hash);
    });

    it('category-merged result has category === "weak-tls-protocol"', () => {
      const result = structuralFindingHash({
        ...BASE,
        scannerName: 'tlsx',
        title: 'Weak TLS version: tls10',
      });
      expect(result.category).toBe('weak-tls-protocol');
    });
  });

  describe('Fallback non-merge', () => {
    it('two inputs with no cveId and titles matching no rule produce DIFFERENT hashes when scannerName differs', () => {
      const a = structuralFindingHash({
        ...BASE,
        scannerName: 'scanner-a',
        title: 'Custom thing A',
      });
      const b = structuralFindingHash({
        ...BASE,
        scannerName: 'scanner-b',
        title: 'Custom thing B',
      });
      expect(a.hash).not.toBe(b.hash);
    });

    it('fallback result has category === null', () => {
      const result = structuralFindingHash({
        ...BASE,
        scannerName: 'scanner-a',
        title: 'Custom thing A',
      });
      expect(result.category).toBeNull();
    });
  });

  describe('CVE takes precedence over category', () => {
    it('an input with both cveId AND a category-matching title uses CVE hash (category null)', () => {
      const withCve = structuralFindingHash({
        ...BASE,
        scannerName: 'nuclei',
        cveId: 'CVE-2021-5555',
        title: 'Self-signed TLS certificate',
      });
      const withoutCve = structuralFindingHash({
        ...BASE,
        scannerName: 'nuclei',
        cveId: 'CVE-2021-5555',
        title: 'Completely different title',
      });
      // Both use CVE path, so same hash despite different titles
      expect(withCve.hash).toBe(withoutCve.hash);
      expect(withCve.category).toBeNull();
    });

    it('category-only path differs from CVE path even on same asset+location', () => {
      const cveResult = structuralFindingHash({
        ...BASE,
        scannerName: 'nuclei',
        cveId: 'CVE-2021-5555',
        title: 'Self-signed TLS certificate',
      });
      const catResult = structuralFindingHash({
        ...BASE,
        scannerName: 'nuclei',
        title: 'Self-signed TLS certificate',
      });
      // CVE hash and category hash must differ (different key prefix)
      expect(cveResult.hash).not.toBe(catResult.hash);
    });
  });

  describe('Determinism', () => {
    it('same input produces the same hash on repeated calls', () => {
      const input = {
        ...BASE,
        scannerName: 'nuclei',
        cveId: 'CVE-2021-1234',
        title: 'Some finding',
      };
      expect(structuralFindingHash(input).hash).toBe(structuralFindingHash(input).hash);
    });

    it('same category-path input is deterministic', () => {
      const input = {
        ...BASE,
        scannerName: 'tlsx',
        title: 'Weak TLS version: tls10',
      };
      expect(structuralFindingHash(input)).toEqual(structuralFindingHash(input));
    });

    it('same raw-fallback input is deterministic', () => {
      const input = {
        ...BASE,
        scannerName: 'scanner-a',
        title: 'Custom thing A',
      };
      expect(structuralFindingHash(input).hash).toBe(structuralFindingHash(input).hash);
    });
  });

  describe('Edge cases', () => {
    it('missing location defaults to empty string (two calls agree)', () => {
      const a = structuralFindingHash({
        assetCanonical: 'h.com',
        scannerName: 'nuclei',
        cveId: 'CVE-2021-9999',
        title: 'X',
      });
      const b = structuralFindingHash({
        assetCanonical: 'h.com',
        location: null,
        scannerName: 'nuclei',
        cveId: 'CVE-2021-9999',
        title: 'X',
      });
      expect(a.hash).toBe(b.hash);
    });
  });
});
