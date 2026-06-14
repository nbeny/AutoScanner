import { generateAgentKeypair, signAgentMessage, verifyAgentSignature } from '../agent-signature';

describe('agent-signature (ed25519)', () => {
  it('generateAgentKeypair yields a pair of base64 strings', () => {
    const keypair = generateAgentKeypair();
    expect(typeof keypair.publicKeyBase64).toBe('string');
    expect(keypair.publicKeyBase64.length).toBeGreaterThan(0);
    expect(typeof keypair.privateKeyBase64).toBe('string');
    expect(keypair.privateKeyBase64.length).toBeGreaterThan(0);
    // Two calls produce different keypairs
    const keypair2 = generateAgentKeypair();
    expect(keypair2.publicKeyBase64).not.toBe(keypair.publicKeyBase64);
  });

  it('signAgentMessage + verifyAgentSignature round-trips a message', () => {
    const { publicKeyBase64, privateKeyBase64 } = generateAgentKeypair();
    const message = 'agent-1|2026-06-14T00:00:00.000Z';
    const sig = signAgentMessage(privateKeyBase64, message);
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
    expect(verifyAgentSignature(publicKeyBase64, message, sig)).toBe(true);
  });

  it('verifyAgentSignature returns false for a tampered message', () => {
    const { publicKeyBase64, privateKeyBase64 } = generateAgentKeypair();
    const message = 'agent-1|2026-06-14T00:00:00.000Z';
    const sig = signAgentMessage(privateKeyBase64, message);
    expect(verifyAgentSignature(publicKeyBase64, message + '!', sig)).toBe(false);
  });

  it('verifyAgentSignature returns false when a different keypair public key is used', () => {
    const kp1 = generateAgentKeypair();
    const kp2 = generateAgentKeypair();
    const message = 'agent-1|2026-06-14T00:00:00.000Z';
    const sig = signAgentMessage(kp1.privateKeyBase64, message);
    expect(verifyAgentSignature(kp2.publicKeyBase64, message, sig)).toBe(false);
  });
});
