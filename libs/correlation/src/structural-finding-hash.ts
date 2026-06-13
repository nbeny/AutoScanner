import { createHash } from 'node:crypto';
import { categorize } from './finding-categories';

export interface StructuralFindingHashInput {
  scannerName: string;
  cveId?: string | null;
  assetCanonical: string;
  location?: string | null;
  title: string;
  templateId?: string | null;
}

/** Deterministic, scanner-independent finding signature. See Phase 7 spec §2.2. */
export function structuralFindingHash(i: StructuralFindingHashInput): {
  hash: string;
  category: string | null;
} {
  const loc = i.location ?? '';
  if (i.cveId) {
    return { hash: sha256(`cve|${i.cveId}|${i.assetCanonical}|${loc}`), category: null };
  }
  const category = categorize(i.title, i.templateId);
  if (category) {
    return { hash: sha256(`cat|${category}|${i.assetCanonical}|${loc}`), category };
  }
  return {
    hash: sha256(`raw|${i.scannerName}|${i.assetCanonical}|${loc}|${i.title}`),
    category: null,
  };
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
