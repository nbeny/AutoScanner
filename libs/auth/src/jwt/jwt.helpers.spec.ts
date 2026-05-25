import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from './jwt.helpers';

describe('jwt helpers', () => {
  const secret = 'a'.repeat(64);

  describe('access tokens', () => {
    it('signs and verifies a token', () => {
      const token = signAccessToken({ sub: 'user-1', sessionId: 'sess-1' }, secret, 60);
      const payload = verifyAccessToken(token, secret);
      expect(payload.sub).toBe('user-1');
      expect(payload.sessionId).toBe('sess-1');
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('rejects token signed with different secret', () => {
      const token = signAccessToken({ sub: 'u', sessionId: 's' }, secret, 60);
      expect(() => verifyAccessToken(token, 'b'.repeat(64))).toThrow();
    });

    it('rejects expired token', () => {
      const token = signAccessToken({ sub: 'u', sessionId: 's' }, secret, -1);
      expect(() => verifyAccessToken(token, secret)).toThrow(/expired/i);
    });

    it('rejects malformed token', () => {
      expect(() => verifyAccessToken('not.a.jwt', secret)).toThrow();
    });
  });

  describe('refresh tokens', () => {
    it('generates a 64-char hex string', () => {
      const t = generateRefreshToken();
      expect(t).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces a deterministic hash via SHA-256', () => {
      const t = generateRefreshToken();
      const h1 = hashRefreshToken(t);
      const h2 = hashRefreshToken(t);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('different tokens hash differently', () => {
      expect(hashRefreshToken(generateRefreshToken())).not.toBe(
        hashRefreshToken(generateRefreshToken()),
      );
    });
  });
});
