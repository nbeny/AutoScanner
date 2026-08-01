import { Injectable } from '@nestjs/common';

import { SecurityAgent } from '../security-agent';
import {
  AssetDiscoveryOutputSchema,
  type AssetDiscoveryInput,
  type AssetDiscoveryOutput,
} from '../planning-schemas';

/** Part 3 §2 — classify what a target actually is from the discovered entities. */
@Injectable()
export class AssetDiscoveryAgent extends SecurityAgent<AssetDiscoveryInput, AssetDiscoveryOutput> {
  readonly role = 'asset-discovery';
  protected readonly outputSchema = AssetDiscoveryOutputSchema;

  protected buildSystemPrompt(): string {
    return [
      'You are a reconnaissance analyst.',
      'Given a target and the raw discovered entities (subdomains, IPs, services, technologies),',
      'produce a de-duplicated, classified asset inventory: for each asset its type, value, the',
      'technologies observed, the cloud provider if evident, and a coarse risk (low/medium/high).',
      'Reply ONLY with a JSON object:',
      '{"assets": [{"type": string, "value": string, "technologies": string[], "cloud"?: string, "risk"?: "low"|"medium"|"high"}]}',
      'No prose outside the JSON.',
    ].join('\n');
  }

  protected buildUserPrompt(input: AssetDiscoveryInput): string {
    return JSON.stringify({ target: input.target, discovered: input.discoveredAssets }, null, 2);
  }

  protected fallback(input: AssetDiscoveryInput): AssetDiscoveryOutput {
    // Echo the discovered entities as-is (no AI classification available).
    return {
      assets: input.discoveredAssets.map((a) => ({
        type: a.type,
        value: a.value,
        technologies: a.technologies ?? [],
      })),
    };
  }
}
