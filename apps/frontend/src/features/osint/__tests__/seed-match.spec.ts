import { describe, expect, it } from 'vitest';
import { emailMatchesFocus, identityMatchesFocus, orgMetaMatchesFocus } from '../seed-match';

describe('seed-match', () => {
  it('passes everything through when there is no focus', () => {
    expect(identityMatchesFocus(null, { seed: 'x' })).toBe(true);
    expect(emailMatchesFocus(null, { address: 'a@b.com' })).toBe(true);
    expect(orgMetaMatchesFocus(null, { data: {} })).toBe(true);
  });

  describe('identityMatchesFocus', () => {
    it('matches an EMAIL focus on both the full address and the local-part', () => {
      const focus = { seed: 'alice@corp.com', seedType: 'EMAIL' as const };
      expect(identityMatchesFocus(focus, { seed: 'alice@corp.com' })).toBe(true);
      expect(identityMatchesFocus(focus, { seed: 'alice' })).toBe(true);
      expect(identityMatchesFocus(focus, { seed: 'bob' })).toBe(false);
    });

    it('matches a USERNAME focus by exact seed', () => {
      const focus = { seed: 'neo', seedType: 'USERNAME' as const };
      expect(identityMatchesFocus(focus, { seed: 'NEO' })).toBe(true);
      expect(identityMatchesFocus(focus, { seed: 'trinity' })).toBe(false);
    });
  });

  describe('emailMatchesFocus', () => {
    it('matches a DOMAIN focus by the address domain', () => {
      const focus = { seed: 'corp.com', seedType: 'DOMAIN' as const };
      expect(emailMatchesFocus(focus, { address: 'admin@corp.com' })).toBe(true);
      expect(emailMatchesFocus(focus, { address: 'admin@other.com' })).toBe(false);
    });

    it('matches an EMAIL focus by exact address or shared domain', () => {
      const focus = { seed: 'alice@corp.com', seedType: 'EMAIL' as const };
      expect(emailMatchesFocus(focus, { address: 'alice@corp.com' })).toBe(true);
      expect(emailMatchesFocus(focus, { address: 'bob@corp.com' })).toBe(true);
      expect(emailMatchesFocus(focus, { address: 'eve@evil.com' })).toBe(false);
    });

    it('hides emails for a USERNAME focus', () => {
      const focus = { seed: 'neo', seedType: 'USERNAME' as const };
      expect(emailMatchesFocus(focus, { address: 'neo@corp.com' })).toBe(false);
    });
  });

  describe('orgMetaMatchesFocus', () => {
    it('matches a DOMAIN focus against data.domain', () => {
      const focus = { seed: 'corp.com', seedType: 'DOMAIN' as const };
      expect(orgMetaMatchesFocus(focus, { data: { domain: 'corp.com' } })).toBe(true);
      expect(orgMetaMatchesFocus(focus, { data: { domain: 'other.com' } })).toBe(false);
      expect(orgMetaMatchesFocus(focus, { data: null })).toBe(false);
    });
  });
});
