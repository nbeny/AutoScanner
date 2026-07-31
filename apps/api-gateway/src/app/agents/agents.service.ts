import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError, verifyAgentSignature } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import type { ParseJobPayload } from '@autoscanner/queues';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { OBJECT_STORAGE, rawOutputKey, type ObjectStorage } from '@autoscanner/storage';

const PARSE_TOPIC = 'security.parse.requested';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const TS_WINDOW_MS = 120_000; // ±120 s

export interface CreateRegistrationInput {
  name: string;
  capabilities?: unknown;
}

export interface EnrollInput {
  bootstrapToken: string;
  publicKey: string;
  capabilities?: unknown;
  hostname?: string;
  version?: string;
}

export interface HeartbeatInput {
  agentId: string;
  ts: string;
  signature: string;
  capabilities?: unknown;
}

export interface ClaimJobInput {
  agentId: string;
  ts: string;
  signature: string;
}

export interface SubmitResultInput {
  jobId: string;
  agentId: string;
  ts: string;
  signature: string;
  exitCode: number;
  rawOutputBase64: string;
}

export interface AgentRegistrationResult {
  agent: { id: string; name: string; status: string };
  bootstrapToken: string;
}

export interface EnrollResult {
  agentId: string;
}

export interface ClaimedJobSpec {
  jobId: string;
  scannerName: string;
  target: string;
  input: unknown;
}

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_BUS) private readonly bus: JobBus,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(ScannerRegistry) private readonly registry: ScannerRegistry,
  ) {}

  async createRegistration(
    userId: string,
    input: CreateRegistrationInput,
  ): Promise<AgentRegistrationResult> {
    const registrationToken = randomBytes(32).toString('base64url');
    const registrationExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    try {
      const agent = await this.prisma.agent.create({
        data: {
          name: input.name,
          capabilities: input.capabilities
            ? (input.capabilities as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          status: 'PENDING',
          registrationToken,
          registrationExpiresAt,
          createdById: userId,
        },
        select: { id: true, name: true, status: true },
      });

      this.logger.log(`Created agent registration: agent=${agent.id} name=${input.name}`);
      return { agent, bootstrapToken: registrationToken };
    } catch (err) {
      const prismaErr = err as { code?: string };
      if (prismaErr.code === 'P2002') {
        throw new ConflictError(`Agent name "${input.name}" is already taken`);
      }
      throw err;
    }
  }

  async enroll(input: EnrollInput, ip: string): Promise<EnrollResult> {
    const agent = await this.prisma.agent.findUnique({
      where: { registrationToken: input.bootstrapToken },
    });

    if (!agent) {
      throw new NotFoundError('Agent', { bootstrapToken: '[redacted]' });
    }
    if (agent.status !== 'PENDING' || agent.enrolledAt !== null) {
      throw new NotFoundError('Agent', { bootstrapToken: '[redacted]' });
    }
    if (!agent.registrationExpiresAt || agent.registrationExpiresAt < new Date()) {
      throw new NotFoundError('Agent', { bootstrapToken: '[redacted - expired]' });
    }

    const updated = await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        publicKey: input.publicKey,
        status: 'ACTIVE',
        enrolledAt: new Date(),
        registrationToken: null,
        registrationExpiresAt: null,
        capabilities: input.capabilities
          ? (input.capabilities as Prisma.InputJsonValue)
          : undefined,
        hostname: input.hostname ?? undefined,
        version: input.version ?? undefined,
        ipAddress: ip,
      },
      select: { id: true },
    });

    this.logger.log(`Agent enrolled: agent=${updated.id}`);
    return { agentId: updated.id };
  }

  private async verifyAndLoad(agentId: string, canonical: string, signature: string, ts: string) {
    // Check ts freshness before loading agent (fail fast)
    const tsMs = new Date(ts).getTime();
    if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > TS_WINDOW_MS) {
      throw new UnauthorizedException('Timestamp out of acceptable window');
    }

    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent || !agent.publicKey) {
      throw new UnauthorizedException('Agent not found or not enrolled');
    }
    if (agent.status === 'REVOKED') {
      throw new UnauthorizedException('Agent is revoked');
    }
    if (agent.status !== 'ACTIVE' && agent.status !== 'IDLE') {
      throw new UnauthorizedException('Agent is not active');
    }

    const valid = verifyAgentSignature(agent.publicKey, canonical, signature);
    if (!valid) {
      throw new UnauthorizedException('Invalid signature');
    }

    return agent;
  }

  async heartbeat(input: HeartbeatInput, ip?: string): Promise<void> {
    const canonical = `${input.agentId}|${input.ts}`;
    await this.verifyAndLoad(input.agentId, canonical, input.signature, input.ts);

    await this.prisma.agent.update({
      where: { id: input.agentId },
      data: {
        lastHeartbeatAt: new Date(),
        status: 'ACTIVE',
        capabilities: input.capabilities
          ? (input.capabilities as Prisma.InputJsonValue)
          : undefined,
        ipAddress: ip ?? undefined,
      },
    });

    this.logger.debug(`Heartbeat: agent=${input.agentId}`);
  }

  async claimJob(input: ClaimJobInput): Promise<ClaimedJobSpec | null> {
    const canonical = `claim|${input.agentId}|${input.ts}`;
    await this.verifyAndLoad(input.agentId, canonical, input.signature, input.ts);

    // TODO(phase-5.4 follow-up): claimJob uses findFirst+update inside a tx without
    // row locking. For multi-agent concurrency, switch to a `FOR UPDATE SKIP LOCKED`
    // raw query. Safe in v1 (single agent/loop); double-claim is also neutralised by
    // the compare-and-swap in submitResult (only one submit can transition RUNNING).
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.scanJob.findFirst({
        where: { agentId: input.agentId, status: 'QUEUED' },
        orderBy: { queuedAt: 'asc' },
        include: { scan: true },
      });

      if (!job) return null;

      await tx.scanJob.update({
        where: { id: job.id },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      this.logger.log(`Job claimed: job=${job.id} agent=${input.agentId}`);
      return {
        jobId: job.id,
        scannerName: job.scannerName,
        target: job.target,
        input: job.input,
      };
    });
  }

  async submitResult(input: SubmitResultInput): Promise<void> {
    const canonical = `result|${input.jobId}|${input.agentId}|${input.ts}`;
    await this.verifyAndLoad(input.agentId, canonical, input.signature, input.ts);

    // C2 + I4: Atomic compare-and-swap — transition RUNNING → terminal status first.
    // This is idempotent: if the job was already submitted (or belongs to another agent,
    // or is not RUNNING), updateMany returns count=0 and we bail out safely.
    const terminalStatus = input.exitCode === 0 ? 'COMPLETED' : 'FAILED';
    const claimed = await this.prisma.scanJob.updateMany({
      where: { id: input.jobId, agentId: input.agentId, status: 'RUNNING' },
      data: { status: terminalStatus, exitCode: input.exitCode, completedAt: new Date() },
    });

    if (claimed.count === 0) {
      throw new NotFoundError('ScanJob', input.jobId);
    }

    // Load the job details needed for storage key and parse-job enqueue.
    const job = await this.prisma.scanJob.findUnique({
      where: { id: input.jobId },
      include: { scan: { select: { id: true, engagementId: true } } },
    });

    // job must exist here (we just updated it), but guard for type safety.
    if (!job) {
      throw new NotFoundError('ScanJob', input.jobId);
    }

    // I3: Guard scanner registry lookup before accessing outputs.
    const scanner = this.registry.get(job.scannerName);
    if (!scanner || !scanner.outputs?.length) {
      throw new NotFoundError('Scanner', job.scannerName);
    }
    const output = scanner.outputs[0];

    const rawBytes = Buffer.from(input.rawOutputBase64, 'base64');
    const key = rawOutputKey({
      engagementId: job.scan.engagementId,
      scanId: job.scanId,
      scanJobId: job.id,
      scannerName: job.scannerName,
      format: output.format,
    });

    await this.storage.ensureBucket('raw-outputs');
    await this.storage.putObject({
      bucket: 'raw-outputs',
      key,
      body: rawBytes,
      contentType: output.format === 'XML' ? 'application/xml' : 'application/octet-stream',
    });

    // Persist the storage key now that the object is durably stored.
    await this.prisma.scanJob.update({
      where: { id: job.id },
      data: { rawOutputKey: key },
    });

    if (terminalStatus === 'COMPLETED') {
      await this.bus.publish<ParseJobPayload>(PARSE_TOPIC, job.id, {
        scanJobId: job.id,
        rawOutputKey: key,
        parserName: output.parser,
        scannerName: job.scannerName,
        target: job.target,
        engagementId: job.scan.engagementId,
      });
    }

    this.logger.log(
      `Result submitted: job=${job.id} status=${terminalStatus} exitCode=${input.exitCode}`,
    );
  }

  listForOwner(userId: string) {
    return this.prisma.agent.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(userId: string, id: string): Promise<boolean> {
    const agent = await this.prisma.agent.findFirst({
      where: { id, createdById: userId },
      select: { id: true },
    });
    if (!agent) throw new NotFoundError('Agent', id);

    await this.prisma.agent.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    this.logger.log(`Agent revoked: agent=${id}`);
    return true;
  }
}
