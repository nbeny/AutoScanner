import { Injectable, Inject, Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { PrismaService } from '@autoscanner/database';
import { SecretBox } from '@autoscanner/common';
import { SECRET_BOX } from '../tokens';
import { GcpInput, GcpInputSchema, LiveCheckResult } from '../types';

function friendlyGcpError(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes('invalid_grant') ||
    lower.includes('private_key') ||
    lower.includes('invalid jwt')
  ) {
    return 'invalid GCP service account JSON';
  }
  if (lower.includes('access_denied') || lower.includes('forbidden')) return 'GCP access denied';
  if (lower.includes('timeout')) return 'GCP request timed out';
  return 'GCP rejected the credential';
}

export interface GcpCredentialInfo {
  principal: string;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_TIMEOUT_MS = 10_000;

@Injectable()
export class GcpCredentialsService {
  private readonly logger = new Logger(GcpCredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
  ) {}

  async set(userId: string, raw: GcpInput): Promise<LiveCheckResult> {
    const parsed = GcpInputSchema.parse(raw);
    const sa = JSON.parse(parsed.serviceAccountJson) as {
      client_email: string;
      project_id: string;
    };
    const check = await this.runLiveCheck(parsed, DEFAULT_TIMEOUT_MS);
    if (!check.ok) return check;

    const data = {
      serviceAccountJsonCipher: this.box.seal(parsed.serviceAccountJson),
      projectId: check.projectId ?? sa.project_id,
      serviceAccountEmail: sa.client_email,
    };

    await this.prisma.gcpCredential.upsert({
      where: { ownerId: userId },
      create: { ownerId: userId, ...data },
      update: data,
    });

    return { ok: true, principal: sa.client_email };
  }

  async get(userId: string): Promise<GcpInput | null> {
    const row = await this.prisma.gcpCredential.findUnique({
      where: { ownerId: userId },
      select: { serviceAccountJsonCipher: true },
    });
    if (!row) return null;
    return { serviceAccountJson: this.box.open(row.serviceAccountJsonCipher as Buffer) };
  }

  async list(userId: string): Promise<GcpCredentialInfo | null> {
    const row = await this.prisma.gcpCredential.findUnique({
      where: { ownerId: userId },
      select: {
        projectId: true,
        serviceAccountEmail: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row || !row.serviceAccountEmail) return null;
    return {
      principal: row.serviceAccountEmail,
      projectId: row.projectId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async delete(userId: string): Promise<boolean> {
    const result = await this.prisma.gcpCredential.deleteMany({ where: { ownerId: userId } });
    return result.count > 0;
  }

  async liveCheck(userId: string): Promise<LiveCheckResult & { projectId?: string }> {
    const input = await this.get(userId);
    if (!input) return { ok: false, error: 'no gcp credential stored' };
    return this.runLiveCheck(input, DEFAULT_TIMEOUT_MS);
  }

  private async runLiveCheck(
    input: GcpInput,
    timeoutMs: number,
  ): Promise<LiveCheckResult & { projectId?: string }> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const parsed = JSON.parse(input.serviceAccountJson);
      const work = (async () => {
        const auth = new GoogleAuth({
          credentials: parsed,
          scopes: ['https://www.googleapis.com/auth/cloud-platform.read-only'],
        });
        await auth.getClient();
        const projectId = await auth.getProjectId();
        return { ok: true as const, principal: parsed.client_email as string, projectId };
      })();
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      });
      return await Promise.race([work, timeout]);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      this.logger.warn(`GCP live-check failed: ${raw}`);
      return { ok: false, error: friendlyGcpError(raw) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
