import { createHash } from 'node:crypto';

export interface FindingDedupHashInput {
  scannerName: string;
  templateId?: string | null;
  assetCanonical: string;
  location?: string | null;
  signature: string;
}

/**
 * Compute the Finding dedupHash (sha256 hex) from a normalized tuple.
 *
 * Recipe (Phase 2 plan, Task 16):
 *
 *   sha256(`${scannerName}|${templateId ?? ''}|${assetCanonical}|${location ?? ''}|${signature}`)
 *
 * Field order is **load-bearing** — do not reorder without coordinating a
 * re-hash of existing Finding rows. The streaming `.update()` form is used
 * (rather than a pre-concatenated string) so the order is auditable from
 * the call site.
 */
export function findingDedupHash(input: FindingDedupHashInput): string {
  return createHash('sha256')
    .update(input.scannerName)
    .update('|')
    .update(input.templateId ?? '')
    .update('|')
    .update(input.assetCanonical)
    .update('|')
    .update(input.location ?? '')
    .update('|')
    .update(input.signature)
    .digest('hex');
}
