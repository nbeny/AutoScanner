import { UnauthorizedException } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  generateAgentKeypair,
  signAgentMessage,
} from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';
import type { Queue } from 'bullmq';
import type { ObjectStorage } from '@autoscanner/storage';
import type { ScannerRegistry } from '@autoscanner/scanner-sdk';

import { AgentsService } from '../agents.service';

const USER_ID = 'user_1';
const AGENT_ID = 'agent_1';
const JOB_ID = 'job_1';
const SCAN_ID = 'scan_1';
const ENGAGEMENT_ID = 'eng_1';

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: AGENT_ID,
    name: 'test-agent',
    hostname: null,
    publicKey: null,
    registrationToken: 'tok_abc',
    registrationExpiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    enrolledAt: null,
    status: 'PENDING',
    capabilities: null,
    version: null,
    lastHeartbeatAt: null,
    ipAddress: null,
    metadata: null,
    createdById: USER_ID,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    scanId: SCAN_ID,
    scannerName: 'nmap',
    target: '192.168.1.1',
    input: { flags: '-sV' },
    status: 'QUEUED',
    agentId: AGENT_ID,
    queuedAt: new Date(),
    startedAt: null,
    completedAt: null,
    exitCode: null,
    rawOutputKey: null,
    errorMessage: null,
    scan: { id: SCAN_ID, engagementId: ENGAGEMENT_ID },
    ...overrides,
  };
}

describe('AgentsService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let parseQueue: jest.Mocked<Queue>;
  let storage: jest.Mocked<ObjectStorage>;
  let registry: jest.Mocked<ScannerRegistry>;
  let svc: AgentsService;

  beforeEach(() => {
    prisma = {
      agent: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      scanJob: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    } as unknown as jest.Mocked<PrismaService>;

    parseQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Queue>;

    storage = {
      ensureBucket: jest.fn().mockResolvedValue(undefined),
      putObject: jest.fn().mockResolvedValue({ etag: 'etag_1' }),
    } as unknown as jest.Mocked<ObjectStorage>;

    registry = {
      get: jest.fn().mockReturnValue({
        outputs: [{ parser: 'nmap-xml', format: 'XML' }],
      }),
    } as unknown as jest.Mocked<ScannerRegistry>;

    svc = new AgentsService(prisma, parseQueue, storage, registry);
  });

  // ─── createRegistration ───────────────────────────────────────────────────

  describe('createRegistration', () => {
    it('creates a PENDING agent and returns a bootstrapToken', async () => {
      (prisma.agent.create as jest.Mock).mockResolvedValue(
        makeAgent({ registrationToken: 'tok_new' }),
      );

      const result = await svc.createRegistration(USER_ID, { name: 'my-agent' });

      expect(prisma.agent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'my-agent',
            createdById: USER_ID,
            status: 'PENDING',
          }),
        }),
      );
      expect(result.bootstrapToken).toBeTruthy();
      expect(typeof result.bootstrapToken).toBe('string');
      expect(result.agent).toBeDefined();
    });

    it('throws ConflictError on duplicate agent name (P2002)', async () => {
      (prisma.agent.create as jest.Mock).mockRejectedValue({ code: 'P2002' });
      await expect(svc.createRegistration(USER_ID, { name: 'dup' })).rejects.toBeInstanceOf(
        ConflictError,
      );
    });
  });

  // ─── enroll ───────────────────────────────────────────────────────────────

  describe('enroll', () => {
    const { publicKeyBase64 } = generateAgentKeypair();

    it('stores the publicKey, sets ACTIVE, clears registrationToken', async () => {
      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(
        makeAgent({
          registrationToken: 'valid_token',
          registrationExpiresAt: new Date(Date.now() + 3600 * 1000),
          status: 'PENDING',
          enrolledAt: null,
        }),
      );
      const updated = makeAgent({
        publicKey: publicKeyBase64,
        status: 'ACTIVE',
        registrationToken: null,
        enrolledAt: new Date(),
      });
      (prisma.agent.update as jest.Mock).mockResolvedValue(updated);

      const result = await svc.enroll(
        {
          bootstrapToken: 'valid_token',
          publicKey: publicKeyBase64,
          hostname: 'box.local',
          version: '1.0.0',
        },
        '10.0.0.1',
      );

      expect(prisma.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publicKey: publicKeyBase64,
            status: 'ACTIVE',
            registrationToken: null,
          }),
        }),
      );
      expect(result.agentId).toBe(AGENT_ID);
    });

    it('throws NotFoundError when bootstrapToken is unknown', async () => {
      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        svc.enroll({ bootstrapToken: 'bad', publicKey: publicKeyBase64 }, '127.0.0.1'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws when token is expired', async () => {
      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(
        makeAgent({
          registrationToken: 'expired',
          registrationExpiresAt: new Date(Date.now() - 1000),
          status: 'PENDING',
        }),
      );
      await expect(
        svc.enroll({ bootstrapToken: 'expired', publicKey: publicKeyBase64 }, '127.0.0.1'),
      ).rejects.toThrow();
    });

    it('throws when agent is already enrolled (not PENDING)', async () => {
      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(
        makeAgent({
          registrationToken: 'used',
          registrationExpiresAt: new Date(Date.now() + 3600 * 1000),
          status: 'ACTIVE',
          enrolledAt: new Date(),
        }),
      );
      await expect(
        svc.enroll({ bootstrapToken: 'used', publicKey: publicKeyBase64 }, '127.0.0.1'),
      ).rejects.toThrow();
    });
  });

  // ─── heartbeat ────────────────────────────────────────────────────────────

  describe('heartbeat', () => {
    it('updates lastHeartbeatAt when signature is valid', async () => {
      const { publicKeyBase64, privateKeyBase64 } = generateAgentKeypair();
      const ts = new Date().toISOString();
      const canonical = `${AGENT_ID}|${ts}`;
      const signature = signAgentMessage(privateKeyBase64, canonical);

      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(
        makeAgent({ publicKey: publicKeyBase64, status: 'ACTIVE' }),
      );
      (prisma.agent.update as jest.Mock).mockResolvedValue(
        makeAgent({ lastHeartbeatAt: new Date() }),
      );

      await svc.heartbeat({ agentId: AGENT_ID, ts, signature }, '10.0.0.1');

      expect(prisma.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastHeartbeatAt: expect.any(Date) }),
        }),
      );
    });

    it('throws UnauthorizedException on bad signature', async () => {
      const { publicKeyBase64 } = generateAgentKeypair();
      const ts = new Date().toISOString();

      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(
        makeAgent({ publicKey: publicKeyBase64, status: 'ACTIVE' }),
      );

      await expect(
        svc.heartbeat({ agentId: AGENT_ID, ts, signature: 'badsig==' }, '10.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException on stale ts (>120s old)', async () => {
      const { publicKeyBase64, privateKeyBase64 } = generateAgentKeypair();
      const staleTs = new Date(Date.now() - 200_000).toISOString();
      const canonical = `${AGENT_ID}|${staleTs}`;
      const signature = signAgentMessage(privateKeyBase64, canonical);

      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(
        makeAgent({ publicKey: publicKeyBase64, status: 'ACTIVE' }),
      );

      await expect(
        svc.heartbeat({ agentId: AGENT_ID, ts: staleTs, signature }, '10.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when agent is REVOKED', async () => {
      const { publicKeyBase64, privateKeyBase64 } = generateAgentKeypair();
      const ts = new Date().toISOString();
      const canonical = `${AGENT_ID}|${ts}`;
      const signature = signAgentMessage(privateKeyBase64, canonical);

      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(
        makeAgent({ publicKey: publicKeyBase64, status: 'REVOKED', revokedAt: new Date() }),
      );

      await expect(
        svc.heartbeat({ agentId: AGENT_ID, ts, signature }, '10.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  // ─── claimJob ─────────────────────────────────────────────────────────────

  describe('claimJob', () => {
    it('returns job spec and marks the job RUNNING', async () => {
      const { publicKeyBase64, privateKeyBase64 } = generateAgentKeypair();
      const ts = new Date().toISOString();
      const canonical = `claim|${AGENT_ID}|${ts}`;
      const signature = signAgentMessage(privateKeyBase64, canonical);

      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(
        makeAgent({ publicKey: publicKeyBase64, status: 'ACTIVE' }),
      );

      const job = makeJob({ status: 'QUEUED' });
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            scanJob: {
              findFirst: jest.fn().mockResolvedValue(job),
              update: jest
                .fn()
                .mockResolvedValue({ ...job, status: 'RUNNING', startedAt: new Date() }),
            },
          };
          return fn(tx);
        },
      );

      const result = await svc.claimJob({ agentId: AGENT_ID, ts, signature });

      expect(result).not.toBeNull();
      expect(result?.jobId).toBe(JOB_ID);
      expect(result?.scannerName).toBe('nmap');
    });

    it('returns null when no QUEUED job exists for this agent', async () => {
      const { publicKeyBase64, privateKeyBase64 } = generateAgentKeypair();
      const ts = new Date().toISOString();
      const canonical = `claim|${AGENT_ID}|${ts}`;
      const signature = signAgentMessage(privateKeyBase64, canonical);

      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(
        makeAgent({ publicKey: publicKeyBase64, status: 'ACTIVE' }),
      );
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            scanJob: {
              findFirst: jest.fn().mockResolvedValue(null),
              update: jest.fn(),
            },
          };
          return fn(tx);
        },
      );

      const result = await svc.claimJob({ agentId: AGENT_ID, ts, signature });
      expect(result).toBeNull();
    });
  });

  // ─── submitResult ─────────────────────────────────────────────────────────

  describe('submitResult', () => {
    it('stores raw output, sets COMPLETED, enqueues parse-job', async () => {
      const { publicKeyBase64, privateKeyBase64 } = generateAgentKeypair();
      const ts = new Date().toISOString();
      const canonical = `result|${JOB_ID}|${AGENT_ID}|${ts}`;
      const signature = signAgentMessage(privateKeyBase64, canonical);

      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(
        makeAgent({ publicKey: publicKeyBase64, status: 'ACTIVE' }),
      );

      const runningJob = makeJob({ status: 'RUNNING', agentId: AGENT_ID });
      (prisma.scanJob.findFirst as jest.Mock).mockResolvedValue(runningJob);
      (prisma.scanJob.update as jest.Mock).mockResolvedValue({
        ...runningJob,
        status: 'COMPLETED',
      });

      const rawOutputBase64 = Buffer.from('<xml>output</xml>', 'utf8').toString('base64');

      await svc.submitResult({
        jobId: JOB_ID,
        agentId: AGENT_ID,
        ts,
        signature,
        exitCode: 0,
        rawOutputBase64,
      });

      expect(storage.ensureBucket).toHaveBeenCalledWith('raw-outputs');
      expect(storage.putObject).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'raw-outputs' }),
      );
      expect(parseQueue.add).toHaveBeenCalledWith(
        'parse',
        expect.objectContaining({
          scanJobId: JOB_ID,
          parserName: 'nmap-xml',
          scannerName: 'nmap',
          target: '192.168.1.1',
          engagementId: ENGAGEMENT_ID,
        }),
      );
      expect(prisma.scanJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED', exitCode: 0 }),
        }),
      );
    });

    it('sets FAILED when exitCode != 0', async () => {
      const { publicKeyBase64, privateKeyBase64 } = generateAgentKeypair();
      const ts = new Date().toISOString();
      const canonical = `result|${JOB_ID}|${AGENT_ID}|${ts}`;
      const signature = signAgentMessage(privateKeyBase64, canonical);

      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(
        makeAgent({ publicKey: publicKeyBase64, status: 'ACTIVE' }),
      );

      const runningJob = makeJob({ status: 'RUNNING', agentId: AGENT_ID });
      (prisma.scanJob.findFirst as jest.Mock).mockResolvedValue(runningJob);
      (prisma.scanJob.update as jest.Mock).mockResolvedValue({ ...runningJob, status: 'FAILED' });

      await svc.submitResult({
        jobId: JOB_ID,
        agentId: AGENT_ID,
        ts,
        signature,
        exitCode: 1,
        rawOutputBase64: Buffer.from('error output', 'utf8').toString('base64'),
      });

      expect(prisma.scanJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED', exitCode: 1 }),
        }),
      );
      // Should NOT enqueue parse-job on failure
      expect(parseQueue.add).not.toHaveBeenCalled();
    });

    it('throws when job does not belong to this agent', async () => {
      const { publicKeyBase64, privateKeyBase64 } = generateAgentKeypair();
      const ts = new Date().toISOString();
      const canonical = `result|${JOB_ID}|${AGENT_ID}|${ts}`;
      const signature = signAgentMessage(privateKeyBase64, canonical);

      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(
        makeAgent({ publicKey: publicKeyBase64, status: 'ACTIVE' }),
      );
      // job belongs to a different agent
      (prisma.scanJob.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        svc.submitResult({
          jobId: JOB_ID,
          agentId: AGENT_ID,
          ts,
          signature,
          exitCode: 0,
          rawOutputBase64: 'aGVsbG8=',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ─── revoke ───────────────────────────────────────────────────────────────

  describe('revoke', () => {
    it('sets REVOKED status and revokedAt', async () => {
      (prisma.agent.findFirst as jest.Mock).mockResolvedValue(makeAgent());
      (prisma.agent.update as jest.Mock).mockResolvedValue(
        makeAgent({ status: 'REVOKED', revokedAt: new Date() }),
      );

      const result = await svc.revoke(USER_ID, AGENT_ID);

      expect(result).toBe(true);
      expect(prisma.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REVOKED', revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('throws NotFoundError when agent is not owned by user', async () => {
      (prisma.agent.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(svc.revoke(USER_ID, AGENT_ID)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.agent.update).not.toHaveBeenCalled();
    });
  });

  // ─── listForOwner ─────────────────────────────────────────────────────────

  describe('listForOwner', () => {
    it('returns agents owned by the user', async () => {
      const agents = [makeAgent()];
      (prisma.agent.findMany as jest.Mock).mockResolvedValue(agents);

      const result = await svc.listForOwner(USER_ID);

      expect(result).toEqual(agents);
      expect(prisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { createdById: USER_ID },
        }),
      );
    });
  });
});
