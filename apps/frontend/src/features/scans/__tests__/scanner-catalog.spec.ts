import { describe, expect, it } from 'vitest';
import {
  SCANNER_CATALOG,
  scannerCategory,
  ALL_SCANNER_NAMES,
  detectTargetType,
  acceptsTarget,
} from '../scanner-catalog';

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

describe('detectTargetType', () => {
  it('classifies IPs, CIDRs, URLs, emails and domains', () => {
    expect(detectTargetType('10.0.0.1')).toBe('ip');
    expect(detectTargetType('10.0.0.0/24')).toBe('cidr');
    expect(detectTargetType('2001:db8::1')).toBe('ip');
    expect(detectTargetType('https://example.com/a?b=1')).toBe('url');
    expect(detectTargetType('john@example.com')).toBe('email');
    expect(detectTargetType('example.com')).toBe('domain');
    expect(detectTargetType('sub.example.co.uk')).toBe('domain');
  });
  it('returns null for ambiguous input (bare username / keyword)', () => {
    expect(detectTargetType('')).toBeNull();
    expect(detectTargetType('acmecorp')).toBeNull();
  });
});

describe('acceptsTarget', () => {
  it('keeps IP-relevant scanners and drops domain-only ones for an IP target', () => {
    expect(acceptsTarget('shodan', 'ip')).toBe(true);
    expect(acceptsTarget('nmap', 'ip')).toBe(true);
    expect(acceptsTarget('subfinder', 'ip')).toBe(false);
    expect(acceptsTarget('whois', 'ip')).toBe(true); // whois accepts domain + ip
  });
  it('keeps domain/web scanners and drops IP-only ones for a domain target', () => {
    expect(acceptsTarget('subfinder', 'domain')).toBe(true);
    expect(acceptsTarget('wpscan', 'domain')).toBe(true); // url-capable → seeded from domain
    expect(acceptsTarget('shodan', 'domain')).toBe(false);
    expect(acceptsTarget('smb-enum', 'domain')).toBe(false);
  });
  it('never hides on ambiguous target or unknown scanner', () => {
    expect(acceptsTarget('subfinder', null)).toBe(true);
    expect(acceptsTarget('brand-new-scanner', 'ip')).toBe(true);
  });
});
