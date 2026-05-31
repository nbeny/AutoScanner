import { cvssToSeverity } from '../cvss-to-severity';

describe('cvssToSeverity', () => {
  it.each<[number, string]>([
    [0, 'LOW'],
    [3.9, 'LOW'],
    [4.0, 'MEDIUM'],
    [6.9, 'MEDIUM'],
    [7.0, 'HIGH'],
    [8.9, 'HIGH'],
    [9.0, 'CRITICAL'],
    [10, 'CRITICAL'],
  ])('maps %s → %s', (score, expected) => {
    expect(cvssToSeverity(score)).toBe(expected);
  });

  it('returns null for null input', () => {
    expect(cvssToSeverity(null)).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(cvssToSeverity(Number.NaN)).toBeNull();
  });
});
