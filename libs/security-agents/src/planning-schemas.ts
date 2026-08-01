import { z } from 'zod';

// ── Technology Identification (Part 3 §3) ───────────────────────────────────
export interface TechIdInput {
  host: string;
  headers?: Record<string, string> | null;
  ports?: number[] | null;
  services?: string[] | null;
}
export const TechIdOutputSchema = z.object({
  technologies: z
    .array(
      z.object({
        name: z.string(),
        version: z.string().optional(),
        confidence: z.number().min(0).max(100).optional(),
      }),
    )
    .default([]),
});
export type TechIdOutput = z.infer<typeof TechIdOutputSchema>;

// ── Security Planner (Part 3 §4) ────────────────────────────────────────────
export interface PlannerInput {
  assetValue: string;
  technologies: string[];
}
export const PlannerOutputSchema = z.object({
  playbooks: z
    .array(
      z.object({
        name: z.string(),
        scanners: z.array(z.string()).default([]),
        rationale: z.string().optional(),
      }),
    )
    .default([]),
});
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

// ── Asset Discovery (Part 3 §2) ─────────────────────────────────────────────
export interface DiscoveredAsset {
  type: string;
  value: string;
  technologies?: string[];
}
export interface AssetDiscoveryInput {
  target: string;
  discoveredAssets: DiscoveredAsset[];
}
export const AssetDiscoveryOutputSchema = z.object({
  assets: z
    .array(
      z.object({
        type: z.string(),
        value: z.string(),
        technologies: z.array(z.string()).default([]),
        cloud: z.string().nullish(),
        risk: z.enum(['low', 'medium', 'high']).optional(),
      }),
    )
    .default([]),
});
export type AssetDiscoveryOutput = z.infer<typeof AssetDiscoveryOutputSchema>;
