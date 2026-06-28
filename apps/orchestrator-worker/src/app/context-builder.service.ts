import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { TemplateStep } from '@autoscanner/templates';

/**
 * Minimal shape of `TemplateRun` rows the builder cares about. Avoids depending
 * on a concrete Prisma type so this service can be unit-tested without the
 * generated client.
 */
export interface TemplateRunLike {
  id: string;
  engagementId: string;
  target: string;
}

interface ScopeRuleLike {
  ruleType: string;
  targetType: string;
  value: string;
}

function urlHost(u: string): string | null {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostInScope(host: string, rules: readonly ScopeRuleLike[]): boolean {
  for (const r of rules) {
    if (r.ruleType !== 'INCLUDE') continue;
    const v = r.value.toLowerCase();
    if (r.targetType === 'DOMAIN' && host === v) return true;
    if (r.targetType === 'WILDCARD_DOMAIN' && (host === v || host.endsWith(`.${v}`))) return true;
  }
  return false;
}

/**
 * Resolves a `step.target` ContextRef into a concrete list of target strings
 * that the step will fan out over.
 *
 * Mapping:
 * - `kind=context, path=target`       -> `[templateRun.target]` (root domain)
 * - `kind=context, path=subdomains`   -> `Subdomain.canonicalValue[]` filtered by engagement
 * - `kind=context, path=urls`         -> `Subdomain.canonicalValue[]` where `httpStatus IS NOT NULL`
 *                                        (Phase 2 simplification — host strings, not full URLs)
 * - `kind=context, path=ipAddresses`  -> `IpAddress.address[]` filtered by engagement
 *
 * Fallback **D3** (Phase 2 plan): if the resolved list is empty AND
 * `stepIndex > 0`, return `[templateRun.target]` so the chain doesn't dead-end
 * on a clean database. This swallows the well-known race where the
 * parser-worker hasn't yet persisted rows by the time the orchestrator
 * advances to step 2. A warning is logged so the operator can investigate if
 * the fallback happens unexpectedly.
 *
 * `kind=static` for `step.target` is rejected — out of scope in Phase 2.
 * `step.inputs` resolution is handled separately by {@link StepExecutor}.
 *
 * Phase 13C: when `path=endpoints` and `stepIndex > 0`, the resolved URL list
 * is filtered against the engagement's INCLUDE ScopeRule set. URLs whose host
 * is not covered by any INCLUDE rule are dropped before being passed to
 * downstream scanners (cariddi/corsy fan-in target). This blocks crawlers that
 * occasionally emit out-of-scope external links from feeding active scanners.
 */
@Injectable()
export class ContextBuilder {
  private readonly logger = new Logger(ContextBuilder.name);

  constructor(private readonly prisma: PrismaService) {}

  async buildTargets(
    step: TemplateStep,
    run: TemplateRunLike,
    stepIndex: number,
  ): Promise<string[]> {
    if (step.target.kind === 'static') {
      throw new Error(
        'Phase 2: kind=static is not supported for step.target — use kind=context with a known path',
      );
    }

    const path = step.target.path;
    let resolved: string[];

    switch (path) {
      case 'target': {
        resolved = [run.target];
        break;
      }
      case 'subdomains': {
        const rows = await this.prisma.subdomain.findMany({
          where: { engagementId: run.engagementId },
        });
        resolved = rows.map((r) => r.canonicalValue);
        break;
      }
      case 'urls': {
        // Phase 2 simplification: emit host strings of Subdomain rows that
        // have an httpStatus probed. Full URL synthesis (scheme://host:port)
        // is deferred to a later phase.
        const rows = await this.prisma.subdomain.findMany({
          where: { engagementId: run.engagementId, httpStatus: { not: null } },
        });
        resolved = rows.map((r) => r.canonicalValue);
        break;
      }
      case 'endpoints': {
        // Full discovered URLs (scheme://host/path?query) — e.g. crawled by
        // katana. These are what the active injection scanners (web-dast,
        // sqli-scan, ssti-scan, ...) fuzz, since a bare host carries no params.
        const rows = await this.prisma.endpoint.findMany({
          where: { engagementId: run.engagementId },
        });
        resolved = rows.map((r) => r.canonicalUrl);
        if (stepIndex > 0 && resolved.length > 0) {
          const rules = (await this.prisma.scopeRule.findMany({
            where: { engagementId: run.engagementId, ruleType: 'INCLUDE' },
            select: { ruleType: true, targetType: true, value: true },
          })) as ScopeRuleLike[];
          if (rules.length > 0) {
            const before = resolved.length;
            resolved = resolved.filter((u) => {
              const h = urlHost(u);
              return h !== null && hostInScope(h, rules);
            });
            const dropped = before - resolved.length;
            if (dropped > 0) {
              this.logger.warn(
                `Phase 13C scope gate: dropped ${dropped} out-of-scope endpoint(s) ` +
                  `for engagement=${run.engagementId} at stepIndex=${stepIndex}`,
              );
            }
          }
        }
        break;
      }
      case 'ipAddresses': {
        const rows = await this.prisma.ipAddress.findMany({
          where: { engagementId: run.engagementId },
        });
        // Prisma column is `value` (canonical IP) — tests use `address` as the
        // domain-facing alias. Support both keys to stay tolerant of future
        // rename without breaking callers.
        resolved = rows.map(
          (r: { address?: string | null; value?: string | null }) => r.address ?? r.value ?? '',
        );
        resolved = resolved.filter((s) => s.length > 0);
        break;
      }
      case 'emails': {
        const rows = await this.prisma.email.findMany({
          where: { engagementId: run.engagementId },
          select: { address: true },
        });
        resolved = rows.map((r) => r.address);
        break;
      }
      default: {
        // Exhaustiveness: TemplateStep types prevent this, but keep a runtime
        // safety net for forward-compat.
        const _exhaustive: never = path;
        throw new Error(`Unknown ContextRef path: ${String(_exhaustive)}`);
      }
    }

    if (resolved.length === 0 && stepIndex > 0) {
      this.logger.warn(
        `D3 fallback: step ${stepIndex} path=${path} resolved to empty for engagement=${run.engagementId}; ` +
          `using root target="${run.target}"`,
      );
      return [run.target];
    }

    return resolved;
  }
}
