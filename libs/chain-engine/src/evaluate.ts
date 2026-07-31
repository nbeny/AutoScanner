import type { ChainDefinition, ChainStep } from '@autoscanner/chains';
import type { WorldState, ResolvableEntities } from './world-state';
import type { EvaluationResult, StepEvaluation, PredicateEval } from './evaluation';
import { evalGuard, CATALOG_VERSION } from './predicates';
import { resolveCandidates, applyFilters } from './resolver';

/**
 * Évalue la chaîne pour un round : renvoie le prochain step non exécuté avec
 * son verdict (run/skip). Fonction PURE et déterministe (spec §7bis).
 */
export function evaluate(
  chain: ChainDefinition,
  world: WorldState,
  entities: ResolvableEntities,
  executedStepIds: ReadonlySet<string>,
): EvaluationResult {
  const step = chain.steps.find((s) => !executedStepIds.has(s.id));
  if (!step) {
    return { done: true, catalogVersion: CATALOG_VERSION };
  }
  return {
    done: false,
    next: evaluateStep(step, world, entities),
    catalogVersion: CATALOG_VERSION,
  };
}

function evaluateStep(
  step: ChainStep,
  world: WorldState,
  entities: ResolvableEntities,
): StepEvaluation {
  // 1. Gate (`when`) — tous les guards doivent passer.
  const guardEvals: PredicateEval[] = (step.when ?? []).map((p) => evalGuard(p, world));
  const gatePassed = guardEvals.every((e) => e.passed);

  // 2. Résolution + filtrage des cibles.
  const candidates = resolveCandidates(step.target.from, entities, world);
  const { kept, evaluated } = applyFilters(candidates, step.target.filter, world);

  // 3. Verdict.
  let action: 'run' | 'skip' = 'run';
  let skipReason: string | undefined;
  if (!gatePassed) {
    action = 'skip';
    const failing = guardEvals.find((e) => !e.passed);
    skipReason = `gate: ${failing?.pred ?? 'when'} non satisfait`;
  } else if (kept.length === 0) {
    action = 'skip';
    skipReason = 'aucune cible';
  }

  return {
    stepId: step.id,
    scannerName: step.scannerName,
    gate: { passed: gatePassed, predicates: guardEvals },
    targets: evaluated,
    action,
    skipReason,
  };
}
