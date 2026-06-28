import { Injectable, Inject, Logger } from '@nestjs/common';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { PrismaService } from '@autoscanner/database';
import { SecretBox } from '@autoscanner/common';
import { SECRET_BOX } from '../tokens';
import { AwsInput, AwsInputSchema, LiveCheckResult } from '../types';

function friendlyAwsError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('access') && lower.includes('denied')) return 'access denied';
  if (lower.includes('invalid') && (lower.includes('access key') || lower.includes('signature'))) {
    return 'invalid AWS credential';
  }
  if (lower.includes('timeout') || lower.includes('aborted')) return 'STS request timed out';
  if (lower.includes('expired')) return 'AWS credential is expired';
  return 'AWS STS rejected the credential';
}

export interface AwsCredentialInfo {
  principal: string | null;
  accountId: string | null;
  region: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SetOptions {
  liveCheckTimeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

@Injectable()
export class AwsCredentialsService {
  private readonly logger = new Logger(AwsCredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
  ) {}

  async set(userId: string, raw: AwsInput, opts: SetOptions = {}): Promise<LiveCheckResult> {
    const parsed = AwsInputSchema.parse(raw);
    const check = await this.runLiveCheck(parsed, opts.liveCheckTimeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (!check.ok) return check;

    const data = {
      accessKeyIdCipher: this.box.seal(parsed.accessKeyId),
      secretAccessKeyCipher: this.box.seal(parsed.secretAccessKey),
      sessionTokenCipher: parsed.sessionToken ? this.box.seal(parsed.sessionToken) : null,
      region: parsed.region ?? null,
      callerArn: check.principal ?? null,
      accountId: check.accountId ?? null,
    };

    await this.prisma.awsCredential.upsert({
      where: { ownerId: userId },
      create: { ownerId: userId, ...data },
      update: data,
    });

    return { ok: true, principal: check.principal };
  }

  async get(userId: string): Promise<AwsInput | null> {
    const row = await this.prisma.awsCredential.findUnique({
      where: { ownerId: userId },
      select: {
        accessKeyIdCipher: true,
        secretAccessKeyCipher: true,
        sessionTokenCipher: true,
        region: true,
      },
    });
    if (!row) return null;
    return {
      accessKeyId: this.box.open(row.accessKeyIdCipher as Buffer),
      secretAccessKey: this.box.open(row.secretAccessKeyCipher as Buffer),
      ...(row.sessionTokenCipher
        ? { sessionToken: this.box.open(row.sessionTokenCipher as Buffer) }
        : {}),
      ...(row.region ? { region: row.region } : {}),
    };
  }

  async list(userId: string): Promise<AwsCredentialInfo | null> {
    const row = await this.prisma.awsCredential.findUnique({
      where: { ownerId: userId },
      select: {
        accessKeyIdCipher: false,
        secretAccessKeyCipher: false,
        sessionTokenCipher: false,
        callerArn: true,
        accountId: true,
        region: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) return null;
    return {
      principal: row.callerArn,
      accountId: row.accountId,
      region: row.region,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async delete(userId: string): Promise<boolean> {
    const result = await this.prisma.awsCredential.deleteMany({ where: { ownerId: userId } });
    return result.count > 0;
  }

  async liveCheck(userId: string): Promise<LiveCheckResult & { accountId?: string }> {
    const input = await this.get(userId);
    if (!input) return { ok: false, error: 'no aws credential stored' };
    return this.runLiveCheck(input, DEFAULT_TIMEOUT_MS);
  }

  private async runLiveCheck(
    input: AwsInput,
    timeoutMs: number,
  ): Promise<LiveCheckResult & { accountId?: string }> {
    const client = new STSClient({
      region: input.region ?? 'us-east-1',
      credentials: {
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
        sessionToken: input.sessionToken,
      },
    });

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error('timeout')), timeoutMs);

    try {
      const out = await client.send(new GetCallerIdentityCommand({}), { abortSignal: ac.signal });
      const principal = out.Arn ?? undefined;
      const accountId = out.Account ?? undefined;
      return { ok: true, principal, accountId };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      this.logger.warn(`AWS STS live-check failed: ${raw}`);
      return { ok: false, error: friendlyAwsError(raw) };
    } finally {
      clearTimeout(timer);
    }
  }
}
