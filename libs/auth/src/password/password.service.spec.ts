import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes a password and verifies it', async () => {
    const hash = await svc.hash('correct-horse-battery-staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await svc.verify(hash, 'correct-horse-battery-staple')).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await svc.hash('s3cret');
    expect(await svc.verify(hash, 'wrong')).toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await svc.hash('same');
    const b = await svc.hash('same');
    expect(a).not.toBe(b);
  });

  it('verify returns false on garbage hash', async () => {
    expect(await svc.verify('not-a-hash', 'whatever')).toBe(false);
  });
});
