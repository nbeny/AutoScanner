import { ScannerCategory } from './types';
import type { ScannerDefinition } from './types';

/** Catégories dont la présence en position primaire fait basculer un scanner en OSINT. */
export const OSINT_CATEGORY_SET: ReadonlySet<ScannerCategory> = new Set([
  ScannerCategory.OSINT,
  ScannerCategory.IDENTITY_OSINT,
  ScannerCategory.PASSIVE_RECON,
  ScannerCategory.BREACH_INTEL,
]);

/** Catégorie primaire effective : `primaryCategory` sinon `category[0]` (ou null). */
export function primaryCategoryOf(
  def: Pick<ScannerDefinition, 'primaryCategory' | 'category'>,
): ScannerCategory | null {
  return def.primaryCategory ?? def.category[0] ?? null;
}

/** Vrai si la catégorie primaire du scanner est OSINT. Fail-safe : sans catégorie ⇒ recon. */
export function isOsintScanner(
  def: Pick<ScannerDefinition, 'primaryCategory' | 'category'>,
): boolean {
  const primary = primaryCategoryOf(def);
  return primary !== null && OSINT_CATEGORY_SET.has(primary);
}
