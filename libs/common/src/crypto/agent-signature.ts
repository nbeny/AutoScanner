import { generateKeyPairSync, sign, verify, createPublicKey, createPrivateKey } from 'node:crypto';

export interface AgentKeypair {
  publicKeyBase64: string;
  privateKeyBase64: string;
}

export function generateAgentKeypair(): AgentKeypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKeyBase64: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
}

export function signAgentMessage(privateKeyBase64: string, message: string): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  return sign(null, Buffer.from(message, 'utf8'), key).toString('base64');
}

export function verifyAgentSignature(
  publicKeyBase64: string,
  message: string,
  signatureBase64: string,
): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}
