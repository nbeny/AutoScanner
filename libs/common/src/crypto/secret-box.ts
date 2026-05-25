import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32) {
      throw new Error(`SecretBox key must be 32 bytes (got ${key.length})`);
    }
    this.key = key;
  }

  seal(plaintext: string | Buffer): Buffer {
    const plain = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([nonce, tag, ct]);
  }

  open(ciphertext: Buffer): string {
    return this.openRaw(ciphertext).toString('utf8');
  }

  openRaw(ciphertext: Buffer): Buffer {
    if (ciphertext.length < NONCE_BYTES + TAG_BYTES) {
      throw new Error('ciphertext too short');
    }
    const nonce = ciphertext.subarray(0, NONCE_BYTES);
    const tag = ciphertext.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
    const ct = ciphertext.subarray(NONCE_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}
