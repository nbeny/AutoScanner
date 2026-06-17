import { compareCpeVersions } from '../cpe-version';

describe('compareCpeVersions', () => {
  const cases: Array<[string, string, number]> = [
    ['1.0.0', '1.0.0', 0],
    ['1.0', '1.0.0', 0], // trailing-zero padding equal
    ['2.0', '2.0.1', -1], // shorter prefix is lower
    ['1.2', '1.10', -1], // numeric segments compared numerically
    ['1.10', '1.2', 1],
    ['1.0.1', '1.0.1a', -1], // revision letter suffix is higher
    ['1.0.1a', '1.0.1', 1],
    ['2.0-rc1', '2.0', -1], // known pre-release tag is lower than the release
    ['2.0', '2.0-rc1', 1],
    ['1.0.0', '2.0.0', -1],
    ['10.0', '9.0', 1],
    ['1.0', '1.0', 0],
    ['1.0.0', '1.0.0a1', -1], // revision letter+num higher than release
  ];
  it.each(cases)('compare(%s, %s) === %d', (a, b, expected) => {
    expect(Math.sign(compareCpeVersions(a, b))).toBe(expected);
  });
});
