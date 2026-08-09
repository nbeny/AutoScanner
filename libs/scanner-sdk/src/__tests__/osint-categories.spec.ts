import { ScannerCategory } from '../types';
import { primaryCategoryOf, isOsintScanner, OSINT_CATEGORY_SET } from '../osint-categories';
import type { ScannerDefinition } from '../types';

function def(partial: Partial<ScannerDefinition>): ScannerDefinition {
  return { name: 'x', category: [], ...(partial as object) } as unknown as ScannerDefinition;
}

describe('osint-categories', () => {
  it('primaryCategoryOf préfère primaryCategory, sinon category[0]', () => {
    expect(primaryCategoryOf(def({ primaryCategory: ScannerCategory.OSINT }))).toBe('osint');
    expect(
      primaryCategoryOf(
        def({ category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.PASSIVE_RECON] }),
      ),
    ).toBe('subdomain-enum');
  });

  it('isOsintScanner vrai seulement si la catégorie primaire est OSINT', () => {
    expect(isOsintScanner(def({ primaryCategory: ScannerCategory.BREACH_INTEL }))).toBe(true);
    expect(
      isOsintScanner(
        def({ category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.PASSIVE_RECON] }),
      ),
    ).toBe(false);
    expect(isOsintScanner(def({ category: [ScannerCategory.PASSIVE_RECON] }))).toBe(true);
  });

  it('un scanner sans catégorie tombe en non-OSINT (fail-safe recon)', () => {
    expect(isOsintScanner(def({ category: [] }))).toBe(false);
  });

  it('OSINT_CATEGORY_SET couvre les 4 catégories OSINT', () => {
    expect([...OSINT_CATEGORY_SET].sort()).toEqual(
      ['breach-intel', 'identity-osint', 'osint', 'passive-recon'].sort(),
    );
  });
});
