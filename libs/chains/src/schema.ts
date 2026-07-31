import { z } from 'zod';
import type { ChainDefinition } from './types';

const contextPath = z.enum(['target', 'subdomains', 'ipAddresses', 'urls', 'endpoints', 'emails']);
const severity = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const predicateSchema = z.discriminatedUnion('pred', [
  z.object({ pred: z.literal('httpDetected') }),
  z.object({ pred: z.literal('hasOpenPort'), port: z.number().int().positive() }),
  z.object({ pred: z.literal('techPresent'), name: z.string().min(1) }),
  z.object({ pred: z.literal('notBehindCdn') }),
  z.object({ pred: z.literal('behindCdn') }),
  z.object({ pred: z.literal('statusIn'), codes: z.array(z.number().int()).min(1) }),
  z.object({ pred: z.literal('hasFindingSeverity'), atLeast: severity }),
  z.object({ pred: z.literal('scannerRan'), name: z.string().min(1) }),
  z.object({ pred: z.literal('scannerNotRun'), name: z.string().min(1) }),
]);

const inputRefSchema = z.union([
  z.object({ kind: z.literal('static'), value: z.unknown() }),
  z.object({ kind: z.literal('context'), path: contextPath }),
]);

const targetSelectorSchema = z.object({
  from: contextPath,
  filter: z.array(predicateSchema).optional(),
});

const chainStepSchema = z.object({
  id: z.string().min(1),
  scannerName: z.string().min(1),
  target: targetSelectorSchema,
  when: z.array(predicateSchema).optional(),
  inputs: z.record(inputRefSchema).optional(),
  requiresCapability: z.string().optional(),
});

const guardrailsSchema = z
  .object({
    maxScans: z.number().int().positive(),
    maxDepth: z.number().int().positive(),
    timeBudgetMs: z.number().int().positive(),
    hostCap: z.number().int().positive(),
  })
  .partial();

const entityKind = z.enum([
  'subdomains',
  'ipAddresses',
  'urls',
  'endpoints',
  'emails',
  'technologies',
  'findings',
  'vulnerabilities',
  'ports',
]);

export const chainDefinitionSchema = z
  .object({
    name: z.string().min(1),
    displayName: z.string().min(1),
    description: z.string(),
    version: z.string().min(1),
    whenToUse: z.string().min(1),
    requiredInputs: z.array(z.string()).optional(),
    produces: z.array(entityKind),
    defaultGuardrails: guardrailsSchema.optional(),
    scopeAcknowledgement: z.string().optional(),
    steps: z.array(chainStepSchema).min(1),
  })
  .superRefine((chain, ctx) => {
    const seen = new Set<string>();
    for (const step of chain.steps) {
      if (seen.has(step.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate step id: ${step.id}` });
      }
      seen.add(step.id);
    }
  });

/** Valide une définition et la renvoie typée. Lève une ZodError si invalide. */
export function validateChain(input: unknown): ChainDefinition {
  return chainDefinitionSchema.parse(input) as ChainDefinition;
}
