import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientSecretCredential } from '@azure/identity';
import { SubscriptionClient } from '@azure/arm-subscriptions';
import { PrismaService } from '@autoscanner/database';
import { SecretBox } from '@autoscanner/common';
import { SECRET_BOX } from '../tokens';
import { AzureInput, AzureInputSchema, LiveCheckResult } from '../types';

export interface AzureCredentialInfo {
  principal: string;
  subscriptionName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function friendlyAzureError(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes('aadsts7000215') ||
    lower.includes('invalid client secret') ||
    lower.includes('invalid client')
  ) {
    return 'invalid Azure client secret';
  }
  if (lower.includes('aadsts70011') || lower.includes('invalid scope'))
    return 'invalid Azure permissions';
  if (lower.includes('not found') || lower.includes('subscriptionnotfound'))
    return 'Azure subscription not found';
  if (lower.includes('timeout') || lower.includes('aborted')) return 'Azure request timed out';
  return 'Azure rejected the credential';
}

@Injectable()
export class AzureCredentialsService {
  private readonly logger = new Logger(AzureCredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
  ) {}

  async set(userId: string, raw: AzureInput): Promise<LiveCheckResult> {
    const parsed = AzureInputSchema.parse(raw);
    const check = await this.runLiveCheck(parsed, DEFAULT_TIMEOUT_MS);
    if (!check.ok) return check;

    const data = {
      tenantIdCipher: this.box.seal(parsed.tenantId),
      clientIdCipher: this.box.seal(parsed.clientId),
      clientSecretCipher: this.box.seal(parsed.clientSecret),
      subscriptionIdCipher: parsed.subscriptionId ? this.box.seal(parsed.subscriptionId) : null,
      subscriptionName: check.subscriptionName ?? null,
      callerObjectId: check.principal ?? null,
    };

    await this.prisma.azureCredential.upsert({
      where: { ownerId: userId },
      create: { ownerId: userId, ...data },
      update: data,
    });

    return { ok: true, principal: check.principal };
  }

  async get(userId: string): Promise<AzureInput | null> {
    const row = await this.prisma.azureCredential.findUnique({
      where: { ownerId: userId },
      select: {
        tenantIdCipher: true,
        clientIdCipher: true,
        clientSecretCipher: true,
        subscriptionIdCipher: true,
      },
    });
    if (!row) return null;
    return {
      tenantId: this.box.open(row.tenantIdCipher as Buffer),
      clientId: this.box.open(row.clientIdCipher as Buffer),
      clientSecret: this.box.open(row.clientSecretCipher as Buffer),
      ...(row.subscriptionIdCipher
        ? { subscriptionId: this.box.open(row.subscriptionIdCipher as Buffer) }
        : {}),
    };
  }

  async list(userId: string): Promise<AzureCredentialInfo | null> {
    const row = await this.prisma.azureCredential.findUnique({
      where: { ownerId: userId },
      select: {
        callerObjectId: true,
        subscriptionName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) return null;
    return {
      principal: row.callerObjectId ?? 'tenant/client (live-check pending)',
      subscriptionName: row.subscriptionName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async delete(userId: string): Promise<boolean> {
    const result = await this.prisma.azureCredential.deleteMany({ where: { ownerId: userId } });
    return result.count > 0;
  }

  async liveCheck(userId: string): Promise<LiveCheckResult & { subscriptionName?: string }> {
    const input = await this.get(userId);
    if (!input) return { ok: false, error: 'no azure credential stored' };
    return this.runLiveCheck(input, DEFAULT_TIMEOUT_MS);
  }

  private async runLiveCheck(
    input: AzureInput,
    timeoutMs: number,
  ): Promise<LiveCheckResult & { subscriptionName?: string }> {
    const cred = new ClientSecretCredential(input.tenantId, input.clientId, input.clientSecret);
    const client = new SubscriptionClient(cred);

    const principal = `${input.tenantId}/${input.clientId}`;

    try {
      const work = (async () => {
        if (input.subscriptionId) {
          const sub = await client.subscriptions.get(input.subscriptionId);
          return { ok: true as const, principal, subscriptionName: sub.displayName };
        }
        for await (const sub of client.subscriptions.list()) {
          return { ok: true as const, principal, subscriptionName: sub.displayName };
        }
        return {
          ok: false as const,
          error: 'no accessible subscription returned by the credential',
        };
      })();
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      });
      try {
        return await Promise.race([work, timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Azure live-check failed: ${raw}`);
      return { ok: false, error: friendlyAzureError(raw) };
    }
  }
}
