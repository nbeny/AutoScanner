import { AwsCredentialsService } from '../aws-credentials.service';
import { SecretBox } from '@autoscanner/common';

// Mock the @aws-sdk/client-sts module
jest.mock('@aws-sdk/client-sts', () => {
  const send = jest.fn();
  return {
    STSClient: jest.fn().mockImplementation(() => ({ send })),
    GetCallerIdentityCommand: jest.fn().mockImplementation((args) => ({ args })),
    __send: send, // exposed for the test to drive the mock
  };
});

import * as stsModule from '@aws-sdk/client-sts';
const stsSend = (stsModule as unknown as { __send: jest.Mock }).__send;

describe('AwsCredentialsService', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const box = new SecretBox(key);

  function makeService(): {
    service: AwsCredentialsService;
    prisma: {
      awsCredential: {
        upsert: jest.Mock;
        findUnique: jest.Mock;
        delete: jest.Mock;
        deleteMany: jest.Mock;
      };
    };
  } {
    const prisma = {
      awsCredential: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const service = new AwsCredentialsService(prisma as never, box);
    return { service, prisma };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('set() rejects when STS returns AccessDenied (no DB write)', async () => {
    const { service, prisma } = makeService();
    stsSend.mockRejectedValueOnce(
      Object.assign(new Error('AccessDenied'), { name: 'AccessDenied' }),
    );

    const result = await service.set('user-1', {
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/access.?denied/i) });
    expect(prisma.awsCredential.upsert).not.toHaveBeenCalled();
  });

  it('set() rejects on STS timeout (no DB write)', async () => {
    const { service, prisma } = makeService();
    stsSend.mockImplementationOnce(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), 15)),
    );
    const result = await service.set(
      'user-1',
      {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      },
      { liveCheckTimeoutMs: 5 },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timeout|timed.out/i);
    expect(prisma.awsCredential.upsert).not.toHaveBeenCalled();
  });

  it('set() upserts encrypted blob + cleartext preview fields on STS success', async () => {
    const { service, prisma } = makeService();
    stsSend.mockResolvedValueOnce({
      Arn: 'arn:aws:iam::111111111111:user/foo',
      Account: '111111111111',
      UserId: 'AIDA...',
    });

    const result = await service.set('user-1', {
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'eu-west-3',
    });

    expect(result).toEqual({
      ok: true,
      principal: 'arn:aws:iam::111111111111:user/foo',
    });
    expect(prisma.awsCredential.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.awsCredential.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ ownerId: 'user-1' });
    expect(Buffer.isBuffer(call.create.accessKeyIdCipher)).toBe(true);
    expect(call.create.region).toBe('eu-west-3');
    expect(call.create.callerArn).toBe('arn:aws:iam::111111111111:user/foo');
    expect(call.create.accountId).toBe('111111111111');
    // Verify the sealed access key decrypts back to the original input
    expect(box.open(call.create.accessKeyIdCipher)).toBe('AKIAIOSFODNN7EXAMPLE');
  });

  it('get() decrypts and returns the stored input', async () => {
    const { service, prisma } = makeService();
    prisma.awsCredential.findUnique.mockResolvedValueOnce({
      accessKeyIdCipher: box.seal('AKIAIOSFODNN7EXAMPLE'),
      secretAccessKeyCipher: box.seal('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'),
      sessionTokenCipher: null,
      region: 'eu-west-3',
    });

    const out = await service.get('user-1');
    expect(out).toEqual({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'eu-west-3',
    });
  });

  it('list() returns metadata-only (no decrypted secrets)', async () => {
    const { service, prisma } = makeService();
    prisma.awsCredential.findUnique.mockResolvedValueOnce({
      callerArn: 'arn:aws:iam::111111111111:user/foo',
      accountId: '111111111111',
      region: 'eu-west-3',
      createdAt: new Date('2026-06-28'),
      updatedAt: new Date('2026-06-28'),
    });

    const out = await service.list('user-1');
    expect(out).toEqual({
      principal: 'arn:aws:iam::111111111111:user/foo',
      accountId: '111111111111',
      region: 'eu-west-3',
      createdAt: new Date('2026-06-28'),
      updatedAt: new Date('2026-06-28'),
    });
    // Confirm select clause did not include cipher fields
    const findCall = prisma.awsCredential.findUnique.mock.calls[0][0];
    expect(findCall.select).toEqual(
      expect.objectContaining({
        accessKeyIdCipher: expect.any(Boolean),
      }),
    );
    expect(findCall.select.accessKeyIdCipher).toBe(false);
  });

  it('delete() returns true when a row was removed, false otherwise', async () => {
    const { service, prisma } = makeService();
    prisma.awsCredential.deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(await service.delete('user-1')).toBe(true);
    prisma.awsCredential.deleteMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.delete('user-2')).toBe(false);
  });
});
