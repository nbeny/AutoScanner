import { AzureCredentialsService } from '../azure-credentials.service';
import { SecretBox } from '@autoscanner/common';

jest.mock('@azure/identity', () => ({
  ClientSecretCredential: jest.fn().mockImplementation(() => ({ kind: 'mock-cred' })),
}));

jest.mock('@azure/arm-subscriptions', () => {
  const get = jest.fn();
  const list = jest.fn();
  return {
    SubscriptionClient: jest.fn().mockImplementation(() => ({
      subscriptions: {
        get,
        list: () => ({
          [Symbol.asyncIterator]: async function* () {
            yield* await list();
          },
        }),
      },
    })),
    __get: get,
    __list: list,
  };
});

import * as armMod from '@azure/arm-subscriptions';
const armGet = (armMod as unknown as { __get: jest.Mock }).__get;
const armList = (armMod as unknown as { __list: jest.Mock }).__list;

describe('AzureCredentialsService', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const box = new SecretBox(key);
  const VALID_INPUT = {
    tenantId: '00000000-0000-0000-0000-000000000001',
    clientId: '00000000-0000-0000-0000-000000000002',
    clientSecret: 'super-secret',
  };

  function makeService() {
    const prisma = {
      azureCredential: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const service = new AzureCredentialsService(prisma as never, box);
    return { service, prisma };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    armList.mockReturnValue([]);
  });

  it('set() rejects on InvalidClient (no DB write)', async () => {
    const { service, prisma } = makeService();
    armList.mockReturnValueOnce(
      (async function* () {
        throw new Error('AADSTS7000215: Invalid client secret');
      })(),
    );
    const result = await service.set('user-1', VALID_INPUT);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid/i);
    expect(prisma.azureCredential.upsert).not.toHaveBeenCalled();
  });

  it('set() upserts on success with explicit subscriptionId', async () => {
    const { service, prisma } = makeService();
    armGet.mockResolvedValueOnce({ subscriptionId: 'sub-uuid', displayName: 'Prod Sub' });
    const result = await service.set('user-1', {
      ...VALID_INPUT,
      subscriptionId: '00000000-0000-0000-0000-000000000003',
    });
    expect(result).toEqual({
      ok: true,
      principal: '00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002',
    });
    const call = prisma.azureCredential.upsert.mock.calls[0][0];
    expect(call.create.subscriptionName).toBe('Prod Sub');
    expect(box.open(call.create.tenantIdCipher)).toBe(VALID_INPUT.tenantId);
    expect(box.open(call.create.clientSecretCipher)).toBe('super-secret');
    // callerObjectId must be persisted so list() can surface the real principal
    expect(call.create.callerObjectId).toBe(
      '00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002',
    );
  });

  it('set() upserts on success without subscriptionId (uses first listed)', async () => {
    const { service, prisma } = makeService();
    armList.mockReturnValueOnce(
      (async function* () {
        yield { subscriptionId: 'sub-auto', displayName: 'Auto Sub' };
      })(),
    );
    const result = await service.set('user-1', VALID_INPUT);
    expect(result.ok).toBe(true);
    const call = prisma.azureCredential.upsert.mock.calls[0][0];
    expect(call.create.subscriptionName).toBe('Auto Sub');
    expect(call.create.subscriptionIdCipher).toBeNull();
  });

  it('list() returns the persisted principal when callerObjectId is set', async () => {
    const { service, prisma } = makeService();
    prisma.azureCredential.findUnique.mockResolvedValueOnce({
      callerObjectId: '00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002',
      subscriptionName: 'Prod Sub',
      createdAt: new Date('2026-06-28'),
      updatedAt: new Date('2026-06-28'),
    });
    const out = await service.list('user-1');
    expect(out).toEqual({
      principal: '00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002',
      subscriptionName: 'Prod Sub',
      createdAt: new Date('2026-06-28'),
      updatedAt: new Date('2026-06-28'),
    });
  });

  it('list() falls back to placeholder when callerObjectId is null', async () => {
    const { service, prisma } = makeService();
    prisma.azureCredential.findUnique.mockResolvedValueOnce({
      callerObjectId: null,
      subscriptionName: 'Prod Sub',
      createdAt: new Date('2026-06-28'),
      updatedAt: new Date('2026-06-28'),
    });
    const out = await service.list('user-1');
    expect(out).toEqual({
      principal: 'tenant/client (live-check pending)',
      subscriptionName: 'Prod Sub',
      createdAt: new Date('2026-06-28'),
      updatedAt: new Date('2026-06-28'),
    });
  });

  it('delete() removes row, returns boolean', async () => {
    const { service, prisma } = makeService();
    prisma.azureCredential.deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(await service.delete('user-1')).toBe(true);
  });
});
