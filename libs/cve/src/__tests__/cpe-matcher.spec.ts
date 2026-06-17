import { parseCpe, cpeMatchApplies, evaluateNode, cveApplies } from '../cpe-matcher';
import type { ConfigNode, MatchCriterion } from '../cpe-matcher';

const target = parseCpe('cpe:2.3:a:openssl:openssl:1.0.1:*:*:*:*:*:*:*');
const m = (over: Partial<MatchCriterion> = {}): MatchCriterion => ({
  criteria: 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*:*',
  vulnerable: true,
  ...over,
});

describe('parseCpe', () => {
  it('extracts vendor/product/version', () => {
    expect(target).toEqual({ vendor: 'openssl', product: 'openssl', version: '1.0.1' });
  });
});

describe('cpeMatchApplies', () => {
  it('exact pinned version matches', () => {
    expect(
      cpeMatchApplies(target, m({ criteria: 'cpe:2.3:a:openssl:openssl:1.0.1:*:*:*:*:*:*:*' })),
    ).toBe(true);
  });
  it('range start/end (incl/excl) applies', () => {
    expect(
      cpeMatchApplies(target, m({ versionStartIncluding: '1.0.0', versionEndExcluding: '1.0.2' })),
    ).toBe(true);
    expect(cpeMatchApplies(target, m({ versionStartExcluding: '1.0.1' }))).toBe(false); // 1.0.1 not > 1.0.1
    expect(cpeMatchApplies(target, m({ versionEndIncluding: '1.0.0' }))).toBe(false); // 1.0.1 not <= 1.0.0
  });
  it('different vendor/product never applies', () => {
    expect(cpeMatchApplies(target, m({ criteria: 'cpe:2.3:a:other:thing:*:*:*:*:*:*:*:*' }))).toBe(
      false,
    );
  });
  it('target with no concrete version + bounds → not applicable (conservative)', () => {
    const star = parseCpe('cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*:*');
    expect(cpeMatchApplies(star, m({ versionEndExcluding: '2.0' }))).toBe(false);
  });
});

describe('evaluateNode + cveApplies', () => {
  it('OR node matches if any vulnerable match applies', () => {
    const node: ConfigNode = {
      operator: 'OR',
      negate: false,
      matches: [
        m({ versionEndIncluding: '0.9' }),
        m({ versionStartIncluding: '1.0.0', versionEndExcluding: '1.0.2' }),
      ],
    };
    expect(evaluateNode(node, target)).toBe(true);
  });
  it('AND node cross-product → not applicable', () => {
    const node: ConfigNode = {
      operator: 'AND',
      negate: false,
      matches: [m(), m({ criteria: 'cpe:2.3:o:linux:linux_kernel:*:*:*:*:*:*:*:*' })],
    };
    expect(evaluateNode(node, target)).toBe(false);
  });
  it('negate inverts', () => {
    const node: ConfigNode = { operator: 'OR', negate: true, matches: [m()] };
    expect(evaluateNode(node, target)).toBe(false);
  });
  it('cveApplies is true if any node applies', () => {
    expect(
      cveApplies(
        [
          { operator: 'OR', negate: false, matches: [m({ versionEndIncluding: '0.1' })] },
          { operator: 'OR', negate: false, matches: [m()] },
        ],
        target,
      ),
    ).toBe(true);
  });
});
