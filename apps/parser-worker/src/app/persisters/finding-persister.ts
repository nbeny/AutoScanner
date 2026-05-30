import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { findingDedupHash } from '@autoscanner/correlation';
import type { NormalizedFinding } from '@autoscanner/parsers';

@Injectable()
export class FindingPersister {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert a Finding for the given asset.
   *
   * `assetCanonical` is the host canonicalised by the caller (lowercased, trim,
   * trailing-dot stripped — see `canonicalize` in `@autoscanner/correlation`).
   * It's part of the dedupHash so two findings located at differently-cased URLs
   * (`Https://API.example.com/path` vs `https://api.example.com/path`) collapse
   * onto the same row.
   *
   * Hash recipe (Phase 2 plan, Task 16):
   *
   *   sig = cveId ?? templateId ?? title
   *   dedupHash = sha256(`${scannerName}|${templateId ?? ''}|${assetCanonical}|${location ?? ''}|${sig}`)
   *
   * Title is intentionally excluded from the primary tuple — the `sig` fallback
   * already covers it when neither cveId nor templateId is present. Field order
   * is load-bearing: do not reorder without coordinating a re-hash of existing
   * rows (today: Phase 2 hasn't deployed Findings to any real DB yet).
   */
  async upsert(
    scanJobId: string,
    assetId: string,
    finding: NormalizedFinding,
    assetCanonical: string,
  ): Promise<void> {
    const sig = finding.cveId ?? finding.templateId ?? finding.title;
    const dedupHash = findingDedupHash({
      scannerName: finding.scannerName,
      templateId: finding.templateId,
      assetCanonical,
      location: finding.location,
      signature: sig,
    });

    const now = new Date();
    await this.prisma.finding.upsert({
      where: { assetId_dedupHash: { assetId, dedupHash } },
      create: {
        assetId,
        scanJobId,
        dedupHash,
        title: finding.title,
        severity: finding.severity,
        location: finding.location,
        cveId: finding.cveId,
        templateId: finding.templateId,
        evidence: finding.evidence as never,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: { lastSeenAt: now },
    });
  }
}
