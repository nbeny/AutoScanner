import { GcpCredentialsService } from '../gcp-credentials.service';
import { SecretBox } from '@autoscanner/common';

const getClient = jest.fn();
const getProjectId = jest.fn();

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getClient,
    getProjectId,
  })),
}));

describe('GcpCredentialsService', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const box = new SecretBox(key);

  const SA = JSON.stringify({
    type: 'service_account',
    project_id: 'my-project',
    private_key:
      '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQ\n-----END PRIVATE KEY-----\n',
    client_email: 'sa@my-project.iam.gserviceaccount.com',
  });

  function makeService() {
    const prisma = {
      gcpCredential: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const service = new GcpCredentialsService(prisma as never, box);
    return { service, prisma };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('set() rejects when getClient throws (no DB write)', async () => {
    const { service, prisma } = makeService();
    getClient.mockRejectedValueOnce(new Error('invalid_grant: private_key invalid'));
    const result = await service.set('user-1', { serviceAccountJson: SA });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid/i);
    expect(prisma.gcpCredential.upsert).not.toHaveBeenCalled();
  });

  it('set() upserts on success with preview fields populated', async () => {
    const { service, prisma } = makeService();
    getClient.mockResolvedValueOnce({});
    getProjectId.mockResolvedValueOnce('my-project');
    const result = await service.set('user-1', { serviceAccountJson: SA });
    expect(result).toEqual({
      ok: true,
      principal: 'sa@my-project.iam.gserviceaccount.com',
    });
    const call = prisma.gcpCredential.upsert.mock.calls[0][0];
    expect(call.create.projectId).toBe('my-project');
    expect(call.create.serviceAccountEmail).toBe('sa@my-project.iam.gserviceaccount.com');
    expect(box.open(call.create.serviceAccountJsonCipher)).toBe(SA);
  });

  it('get() decrypts and returns the stored input', async () => {
    const { service, prisma } = makeService();
    prisma.gcpCredential.findUnique.mockResolvedValueOnce({
      serviceAccountJsonCipher: box.seal(SA),
    });
    const out = await service.get('user-1');
    expect(out).toEqual({ serviceAccountJson: SA });
  });

  it('list() returns metadata-only', async () => {
    const { service, prisma } = makeService();
    prisma.gcpCredential.findUnique.mockResolvedValueOnce({
      projectId: 'my-project',
      serviceAccountEmail: 'sa@my-project.iam.gserviceaccount.com',
      createdAt: new Date('2026-06-28'),
      updatedAt: new Date('2026-06-28'),
    });
    const out = await service.list('user-1');
    expect(out).toEqual({
      principal: 'sa@my-project.iam.gserviceaccount.com',
      projectId: 'my-project',
      createdAt: new Date('2026-06-28'),
      updatedAt: new Date('2026-06-28'),
    });
  });

  it('delete() returns boolean per row presence', async () => {
    const { service, prisma } = makeService();
    prisma.gcpCredential.deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(await service.delete('user-1')).toBe(true);
    prisma.gcpCredential.deleteMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.delete('u2')).toBe(false);
  });
});
