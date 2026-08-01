import { Injectable } from '@nestjs/common';

import { SecurityAgent } from '../security-agent';
import { PlannerOutputSchema, type PlannerInput, type PlannerOutput } from '../planning-schemas';
import { selectPlaybooks } from '../playbook-ruleset';

/** Part 3 §4 — turn an asset + its technologies into an ordered playbook/scanner plan. */
@Injectable()
export class PlannerAgent extends SecurityAgent<PlannerInput, PlannerOutput> {
  readonly role = 'planner';
  protected readonly outputSchema = PlannerOutputSchema;

  protected buildSystemPrompt(): string {
    return [
      'You are a penetration-test planner.',
      'Given an asset and its detected technologies, choose the security playbooks to run and the',
      'scanners each playbook uses. Prefer the platform playbook conventions below as grounding,',
      'but you may add a playbook the technologies clearly justify.',
      'Known playbook mappings (technology -> playbook: scanners):',
      '  graphql -> GRAPHQL_SECURITY: graphw00f, graphql-cop, nuclei',
      '  kubernetes -> KUBERNETES_SECURITY: kube-hunter, kubescape, trivy',
      '  aws/s3 -> CLOUD_SECURITY: prowler, trivy, s3scanner',
      '  active-directory/ldap -> AD_SECURITY: enum4linux, kerbrute',
      '  wordpress -> WORDPRESS_SECURITY: wpscan, nuclei',
      '  api -> API_SECURITY: nuclei, kiterunner',
      'Reply ONLY with a JSON object:',
      '{"playbooks": [{"name": string, "scanners": string[], "rationale"?: string}]}',
      'No prose outside the JSON.',
    ].join('\n');
  }

  protected buildUserPrompt(input: PlannerInput): string {
    return JSON.stringify({ asset: input.assetValue, technologies: input.technologies }, null, 2);
  }

  protected fallback(input: PlannerInput): PlannerOutput {
    // Deterministic playbook selection from the ruleset — the same grounding the prompt gives.
    return {
      playbooks: selectPlaybooks(input.technologies).map((r) => ({
        name: r.playbook,
        scanners: r.scanners,
        rationale: 'Selected by the deterministic playbook ruleset (AI planner unavailable).',
      })),
    };
  }
}
