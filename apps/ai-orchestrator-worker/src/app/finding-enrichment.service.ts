import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import {
  FindingAnalystAgent,
  FalsePositiveAgent,
  RemediationAgent,
} from '@autoscanner/security-agents';

/** How many findings (highest severity first) the fleet enriches — bounds Claude token spend. */
const MAX_ENRICHED = 10;

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
};

export interface EnrichedFinding {
  title: string;
  severity: string;
  cveId: string | null;
  impact: string;
  priority: string;
  action: string;
  confidence: number;
  status: string;
  remediation: string[];
  degraded: boolean;
}

export interface RunEnrichment {
  findings: EnrichedFinding[];
}

/**
 * Runs the fleet's post-scan reasoning agents (Finding Analyst §6, False-Positive §7,
 * Remediation §11) over an AiRun's findings (SP4c). Purely additive to the proven decision loop:
 * the supervisor calls this before the audit and stores the result on `AiRun.analysisJson`. Every
 * agent already degrades to a deterministic fallback, and each finding is enriched independently,
 * so a Claude outage never fails the run — it just yields fallback analyses.
 */
@Injectable()
export class FindingEnrichmentService {
  private readonly logger = new Logger(FindingEnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyst: FindingAnalystAgent,
    private readonly falsePositive: FalsePositiveAgent,
    private readonly remediation: RemediationAgent,
  ) {}

  async enrich(aiRunId: string): Promise<RunEnrichment> {
    const rows = await this.prisma.finding.findMany({
      where: { scanJob: { scan: { aiRunId } } },
      select: { title: true, severity: true, cveId: true, location: true, evidence: true },
    });

    const ranked = rows
      .map((r) => ({ ...r, severity: String(r.severity) }))
      .sort((a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0))
      .slice(0, MAX_ENRICHED);

    const findings: EnrichedFinding[] = [];
    for (const f of ranked) {
      const [analysis, fp, rem] = await Promise.all([
        this.analyst.run({
          title: f.title,
          severity: f.severity,
          cveId: f.cveId,
          location: f.location,
          evidence: f.evidence,
        }),
        this.falsePositive.run({ title: f.title, severity: f.severity, evidence: f.evidence }),
        this.remediation.run({ title: f.title, severity: f.severity, cveId: f.cveId }),
      ]);

      findings.push({
        title: f.title,
        severity: f.severity,
        cveId: f.cveId,
        impact: analysis.output.impact,
        priority: analysis.output.priority,
        action: analysis.output.action,
        confidence: fp.output.confidence,
        status: fp.output.status,
        remediation: rem.output.steps,
        degraded: analysis.degraded || fp.degraded || rem.degraded,
      });
    }

    if (findings.length > 0) {
      this.logger.log(`enriched ${findings.length} finding(s) for aiRun=${aiRunId}`);
    }
    return { findings };
  }
}
