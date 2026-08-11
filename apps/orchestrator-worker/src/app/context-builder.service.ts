import { Injectable } from '@nestjs/common';
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

/**
 * Resolves a template step to its concrete target list.
 *
 * **SP3a** — templates are linear playlists: every step runs against the run's
 * root target. The discovery fan-out (subdomains / urls / ipAddresses /
 * endpoints / emails) is gone because SP1 scanners produce no entities, so this
 * builder simply returns `[run.target]`. Kept as an injected service (callers
 * still call `buildTargets`) to keep the StepExecutor wiring stable.
 */
@Injectable()
export class ContextBuilder {
  async buildTargets(
    _step: TemplateStep,
    run: TemplateRunLike,
    _stepIndex: number,
  ): Promise<string[]> {
    return [run.target];
  }
}
