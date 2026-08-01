import { Inject, Injectable, Logger } from '@nestjs/common';
import { TicketProvider, type IntegrationCredential, type Ticket } from '@prisma/client';
import { NotFoundError, SecretBox, ValidationError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import {
  GitHubTicketAdapter,
  JiraTicketAdapter,
  formatFindingIssue,
  type CreatedIssue,
  type GitHubConfig,
  type JiraConfig,
} from '@autoscanner/ticketing';

import { SECRET_BOX } from './secret-box.provider';
import type { CreateIntegrationCredentialInput, CreateTicketInput } from './dto/integration.dto';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRET_BOX) private readonly secretBox: SecretBox,
    private readonly github: GitHubTicketAdapter,
    private readonly jira: JiraTicketAdapter,
  ) {}

  async createCredential(
    userId: string,
    input: CreateIntegrationCredentialInput,
  ): Promise<IntegrationCredential> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.config);
    } catch {
      throw new ValidationError('config must be valid JSON');
    }
    const configEncrypted = this.secretBox.seal(JSON.stringify(parsed));

    // One credential per (user, provider): upsert so re-configuring replaces the secret.
    return this.prisma.integrationCredential.upsert({
      where: { userId_provider: { userId, provider: input.provider } },
      create: {
        userId,
        provider: input.provider,
        name: input.name,
        configEncrypted,
        enabled: true,
      },
      update: { name: input.name, configEncrypted, enabled: true, deletedAt: null },
    });
  }

  listCredentials(userId: string): Promise<IntegrationCredential[]> {
    return this.prisma.integrationCredential.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTicket(userId: string, input: CreateTicketInput): Promise<Ticket> {
    const cluster = await this.prisma.correlatedFinding.findUnique({
      where: { id: input.correlatedFindingId },
      select: {
        id: true,
        engagementId: true,
        title: true,
        severity: true,
        cveId: true,
        engagement: { select: { ownerId: true } },
        asset: { select: { canonicalValue: true } },
      },
    });
    if (!cluster) throw new NotFoundError('CorrelatedFinding', input.correlatedFindingId);
    if (cluster.engagement.ownerId !== userId) {
      throw new NotFoundError('CorrelatedFinding', input.correlatedFindingId);
    }

    const cred = await this.prisma.integrationCredential.findFirst({
      where: { userId, provider: input.provider, enabled: true, deletedAt: null },
    });
    if (!cred) {
      throw new ValidationError(`no enabled ${input.provider} integration credential configured`);
    }

    const issue = formatFindingIssue({
      title: cluster.title,
      severity: String(cluster.severity),
      cveId: cluster.cveId,
      assetValue: cluster.asset.canonicalValue,
    });

    // Persist the intent first (PENDING) so a failed external call is still auditable.
    const ticket = await this.prisma.ticket.create({
      data: {
        engagementId: cluster.engagementId,
        correlatedFindingId: cluster.id,
        credentialId: cred.id,
        provider: input.provider,
        title: issue.title,
        createdById: userId,
      },
    });

    try {
      const config = JSON.parse(this.secretBox.open(cred.configEncrypted as Buffer)) as unknown;
      const created = await this.dispatch(input.provider, config, issue);
      return this.prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: 'CREATED',
          externalId: created.externalId,
          externalUrl: created.externalUrl,
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(`ticket ${ticket.id} create failed: ${errorMessage}`);
      return this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'FAILED', errorMessage },
      });
    }
  }

  private dispatch(
    provider: TicketProvider,
    config: unknown,
    issue: ReturnType<typeof formatFindingIssue>,
  ): Promise<CreatedIssue> {
    switch (provider) {
      case 'GITHUB':
        return this.github.createIssue(config as GitHubConfig, issue);
      case 'JIRA':
        return this.jira.createIssue(config as JiraConfig, issue);
      default:
        throw new ValidationError(`provider ${provider} is not supported yet`);
    }
  }
}
