import { TOTP } from 'otpauth';
import { TotpService } from './totp.service';

describe('TotpService', () => {
  const svc = new TotpService();

  it('generates a secret of 20 bytes base32', () => {
    const secret = svc.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('builds an otpauth URI with issuer and label', () => {
    const secret = svc.generateSecret();
    const uri = svc.buildUri({ secret, account: 'admin@local', issuer: 'AutoScanner' });
    expect(uri).toMatch(/^otpauth:\/\/totp\/AutoScanner:admin%40local\?/);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('issuer=AutoScanner');
  });

  it('verifies a code generated for the secret', () => {
    const secret = svc.generateSecret();
    const code = new TOTP({ secret, digits: 6, period: 30 }).generate();
    expect(svc.verify(secret, code)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const secret = svc.generateSecret();
    expect(svc.verify(secret, '000000')).toBe(false);
  });

  it('rejects malformed codes', () => {
    expect(svc.verify(svc.generateSecret(), 'abc')).toBe(false);
    expect(svc.verify(svc.generateSecret(), '12345')).toBe(false);
  });
});
