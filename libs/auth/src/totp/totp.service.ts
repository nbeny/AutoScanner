import { Secret, TOTP } from 'otpauth';

export interface BuildUriInput {
  secret: string;
  account: string;
  issuer: string;
}

export class TotpService {
  generateSecret(): string {
    return new Secret({ size: 20 }).base32;
  }

  buildUri(input: BuildUriInput): string {
    return new TOTP({
      issuer: input.issuer,
      label: input.account,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: input.secret,
    }).toString();
  }

  verify(secret: string, code: string): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    const delta = new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    }).validate({ token: code, window: 1 });
    return delta !== null;
  }
}
