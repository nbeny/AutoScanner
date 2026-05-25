import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  sub: string;
  sessionId: string;
}

export interface VerifiedAccessToken extends AccessTokenPayload {
  iat: number;
  exp: number;
}

export function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  ttlSeconds: number,
): string {
  return jwt.sign(payload, secret, {
    algorithm: 'HS512',
    expiresIn: ttlSeconds,
  });
}

export function verifyAccessToken(token: string, secret: string): VerifiedAccessToken {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS512'] });
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('invalid token shape');
  }
  return decoded as VerifiedAccessToken;
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
