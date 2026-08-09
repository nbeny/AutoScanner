import { scanLogKey } from '../types';

describe('scanLogKey', () => {
  it('produit une clé déterministe par scanJobId', () => {
    expect(scanLogKey('abc-123')).toBe('abc-123.log');
    expect(scanLogKey('abc-123')).toBe(scanLogKey('abc-123'));
  });
});
