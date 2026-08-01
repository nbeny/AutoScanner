import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import { SecurityCopilotAgent } from '@autoscanner/security-agents';

export interface CopilotAnswer {
  answer: string;
  references: string[];
  degraded: boolean;
}

/**
 * Security Copilot (Part 3 §15 / Part 4 §17). Assembles a compact engagement context from the DB
 * (top correlated findings + exposed assets) and asks the copilot agent the operator's question.
 * Ownership is enforced here; the agent never sees data from another owner's engagement.
 */
@Injectable()
export class CopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly copilot: SecurityCopilotAgent,
  ) {}

  async ask(userId: string, engagementId: string, question: string): Promise<CopilotAnswer> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);

    const context = await this.buildContext(engagementId, engagement.name);
    const { output, degraded } = await this.copilot.run({ question, context });
    return { answer: output.answer, references: output.references, degraded };
  }

  private async buildContext(engagementId: string, name: string): Promise<string> {
    const clusters = await this.prisma.correlatedFinding.findMany({
      where: { engagementId },
      orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
      take: 25,
      select: {
        title: true,
        severity: true,
        cveId: true,
        status: true,
        asset: { select: { canonicalValue: true } },
      },
    });

    const assets = await this.prisma.asset.findMany({
      where: { engagementId, deletedAt: null },
      orderBy: { riskScore: 'desc' },
      take: 15,
      select: { canonicalValue: true, type: true, riskScore: true },
    });

    const findingLines = clusters.length
      ? clusters
          .map(
            (c) =>
              `- [${c.severity}] ${c.title}${c.cveId ? ` (${c.cveId})` : ''} on ${
                c.asset.canonicalValue
              } — status ${c.status}`,
          )
          .join('\n')
      : '(no findings yet)';

    const assetLines = assets.length
      ? assets.map((a) => `- ${a.canonicalValue} [${a.type}] risk=${a.riskScore ?? 0}`).join('\n')
      : '(no assets yet)';

    return [
      `Engagement: ${name}`,
      '',
      `Top findings (by severity):`,
      findingLines,
      '',
      `Top assets (by risk score):`,
      assetLines,
    ].join('\n');
  }
}
