import { NotFoundError, SecretBox } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';
import { EngagementAuthService } from '../engagement-auth.service';

function makePrisma(overrides: Record<string, unknown> = {}): PrismaService {
  return {
    engagement: { findFirst: jest.fn().mockResolvedValue({ id: 'eng_1' }) },
    engagementAuthProfile: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  } as unknown as PrismaService;
}

// 32-byte base64 key for SecretBox.
const box = new SecretBox(Buffer.alloc(32).toString('base64'));

describe('EngagementAuthService', () => {
  it('seals cookie + headers into the profile (round-trips through SecretBox)', async () => {
    const prisma = makePrisma();
    const svc = new EngagementAuthService(prisma, box);

    const ok = await svc.set('u1', 'eng_1', {
      cookie: 'session=abc',
      headers: [{ name: 'Authorization', value: 'Bearer xyz' }],
    });

    expect(ok).toBe(true);
    const upsert = (prisma.engagementAuthProfile.upsert as jest.Mock).mock.calls[0][0];
    const sealed = upsert.create.ciphertext as Buffer;
    expect(JSON.parse(box.open(sealed))).toEqual({
      cookie: 'session=abc',
      headers: { Authorization: 'Bearer xyz' },
    });
  });

  it('rejects an engagement the user does not own', async () => {
    const prisma = makePrisma({ engagement: { findFirst: jest.fn().mockResolvedValue(null) } });
    const svc = new EngagementAuthService(prisma, box);
    await expect(svc.set('intruder', 'eng_1', { cookie: 'x' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('status reports configured=false when no profile exists', async () => {
    const svc = new EngagementAuthService(makePrisma(), box);
    expect(await svc.status('u1', 'eng_1')).toEqual({ configured: false, updatedAt: undefined });
  });

  it('delete returns true when a row was removed', async () => {
    const svc = new EngagementAuthService(makePrisma(), box);
    expect(await svc.delete('u1', 'eng_1')).toBe(true);
  });
});
