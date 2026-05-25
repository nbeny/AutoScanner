import { SecretBox } from './secret-box';

describe('SecretBox (AES-256-GCM)', () => {
  const key = Buffer.alloc(32, 1).toString('base64');

  it('round-trips a plaintext', () => {
    const box = new SecretBox(key);
    const plaintext = 'hello world';
    const ct = box.seal(plaintext);
    expect(ct).toBeInstanceOf(Buffer);
    expect(ct.length).toBeGreaterThan(plaintext.length);
    const out = box.open(ct);
    expect(out).toBe(plaintext);
  });

  it('round-trips a Buffer payload', () => {
    const box = new SecretBox(key);
    const plain = Buffer.from([1, 2, 3, 4]);
    const ct = box.seal(plain);
    expect(box.openRaw(ct)).toEqual(plain);
  });

  it('produces different ciphertexts for same plaintext (random nonce)', () => {
    const box = new SecretBox(key);
    const a = box.seal('same');
    const b = box.seal('same');
    expect(a.equals(b)).toBe(false);
  });

  it('throws on tampered ciphertext', () => {
    const box = new SecretBox(key);
    const ct = box.seal('payload');
    ct[ct.length - 1] ^= 0xff;
    expect(() => box.open(ct)).toThrow();
  });

  it('throws if key is not 32 bytes', () => {
    expect(() => new SecretBox(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
