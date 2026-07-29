import { emptyNormalizedOutput } from '../types';

describe('emptyNormalizedOutput', () => {
  it('includes an empty breachExposures array', () => {
    expect(emptyNormalizedOutput().breachExposures).toEqual([]);
  });
});
