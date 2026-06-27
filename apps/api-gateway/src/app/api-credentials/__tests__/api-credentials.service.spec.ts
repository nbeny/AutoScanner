import { SecretBox } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';
import { ApiProvider } from '@prisma/client';

import { ApiCredentialsService } from '../api-credentials.service';

// 32 bytes all set to 0x01, base64-encoded — deterministic test key
const TEST_KEY_BASE64 = Buffer.alloc(32, 1).toString('base64');

describe('ApiCredentialsService', () => {
  let prisma: jest.Mocked<Pick<PrismaService, 'apiCredential'>>;
  let svc: ApiCredentialsService;
  let box: SecretBox;

  const userId = 'user_1';
  const provider = ApiProvider.SHODAN;

  beforeEach(() => {
    prisma = {
      apiCredential: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    } as unknown as jest.Mocked<Pick<PrismaService, 'apiCredential'>>;

    box = new SecretBox(TEST_KEY_BASE64);
    svc = new ApiCredentialsService(prisma as unknown as PrismaService, box);
  });

  describe('set', () => {
    it('seals the secret and calls upsert with a Buffer ciphertext that is not equal to the plaintext bytes', async () => {
      (prisma.apiCredential.upsert as jest.Mock).mockResolvedValueOnce({});

      const secret = 'my-api-secret-key';
      const result = await svc.set(userId, provider, secret);

      expect(result).toBe(true);
      expect(prisma.apiCredential.upsert).toHaveBeenCalledTimes(1);

      const call = (prisma.apiCredential.upsert as jest.Mock).mock.calls[0][0] as {
        where: { ownerId_provider: { ownerId: string; provider: ApiProvider } };
        create: { ownerId: string; provider: ApiProvider; ciphertext: Buffer };
        update: { ciphertext: Buffer };
      };

      // Compound unique key must be used
      expect(call.where.ownerId_provider).toEqual({ ownerId: userId, provider });

      // create and update must include ciphertext as a Buffer
      const ciphertext = call.create.ciphertext;
      expect(Buffer.isBuffer(ciphertext)).toBe(true);

      // The stored ciphertext must NOT equal the plaintext bytes
      const plaintextBytes = Buffer.from(secret, 'utf8');
      expect(ciphertext.equals(plaintextBytes)).toBe(false);
    });

    it('uses the compound ownerId_provider key in the upsert where clause', async () => {
      (prisma.apiCredential.upsert as jest.Mock).mockResolvedValueOnce({});

      await svc.set(userId, ApiProvider.CENSYS, 'another-secret');

      const call = (prisma.apiCredential.upsert as jest.Mock).mock.calls[0][0] as {
        where: { ownerId_provider: { ownerId: string; provider: ApiProvider } };
      };
      expect(call.where).toEqual({
        ownerId_provider: { ownerId: userId, provider: ApiProvider.CENSYS },
      });
    });
  });

  describe('round-trip', () => {
    it('the ciphertext captured from upsert can be decrypted back to the original secret', async () => {
      (prisma.apiCredential.upsert as jest.Mock).mockResolvedValueOnce({});

      const secret = 'super-secret-shodan-key';
      await svc.set(userId, provider, secret);

      const call = (prisma.apiCredential.upsert as jest.Mock).mock.calls[0][0] as {
        create: { ciphertext: Buffer };
      };
      const ciphertext = call.create.ciphertext;

      // Decrypt using a fresh SecretBox with the same key
      const recovered = new SecretBox(TEST_KEY_BASE64).open(ciphertext);
      expect(recovered).toBe(secret);
    });
  });

  describe('list', () => {
    it('calls findMany with ownerId filter and NO ciphertext in select', async () => {
      const now = new Date();
      const fixture = [
        { provider: ApiProvider.SHODAN, createdAt: now, updatedAt: now },
        { provider: ApiProvider.CENSYS, createdAt: now, updatedAt: now },
      ];
      (prisma.apiCredential.findMany as jest.Mock).mockResolvedValueOnce(fixture);

      const result = await svc.list(userId);

      expect(prisma.apiCredential.findMany).toHaveBeenCalledWith({
        where: { ownerId: userId },
        select: { provider: true, createdAt: true, updatedAt: true },
      });

      // Verify ciphertext is NOT in the select
      const selectArg = (prisma.apiCredential.findMany as jest.Mock).mock.calls[0][0]
        .select as Record<string, unknown>;
      expect(selectArg).not.toHaveProperty('ciphertext');

      // Returns the mapped results
      expect(result).toEqual(fixture);
    });

    it('returns an empty array when the user has no credentials', async () => {
      (prisma.apiCredential.findMany as jest.Mock).mockResolvedValueOnce([]);

      const result = await svc.list(userId);

      expect(result).toEqual([]);
    });
  });

  describe('delete', () => {
    it('returns true when deleteMany removes at least one record', async () => {
      (prisma.apiCredential.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      const result = await svc.delete(userId, provider);

      expect(result).toBe(true);
      expect(prisma.apiCredential.deleteMany).toHaveBeenCalledWith({
        where: { ownerId: userId, provider },
      });
    });

    it('returns false when deleteMany removes zero records', async () => {
      (prisma.apiCredential.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      const result = await svc.delete(userId, provider);

      expect(result).toBe(false);
    });
  });

  describe.each([ApiProvider.CHAOS, ApiProvider.FOFA, ApiProvider.UNCOVER])(
    'phase-13a provider %s',
    (newProvider) => {
      it('seals & upserts the secret with the correct compound key', async () => {
        const otherUserId = 'user-13a';
        (prisma.apiCredential.upsert as jest.Mock).mockResolvedValueOnce({});

        const ok = await svc.set(otherUserId, newProvider, 'plaintext-secret-' + newProvider);

        expect(ok).toBe(true);
        expect(prisma.apiCredential.upsert).toHaveBeenCalledTimes(1);
        const call = (prisma.apiCredential.upsert as jest.Mock).mock.calls[0][0] as {
          where: { ownerId_provider: { ownerId: string; provider: ApiProvider } };
          create: { ownerId: string; provider: ApiProvider; ciphertext: Buffer };
          update: { ciphertext: Buffer };
        };
        expect(call.where.ownerId_provider).toEqual({
          ownerId: otherUserId,
          provider: newProvider,
        });
        expect(Buffer.isBuffer(call.create.ciphertext)).toBe(true);
        expect(call.create.provider).toBe(newProvider);
      });
    },
  );
});
