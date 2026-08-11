import { ScannerCategory } from '../types';

describe('ScannerCategory Kali taxonomy additions', () => {
  it('exposes the new categories needed to map the Kali dataset', () => {
    expect(ScannerCategory.EXPLOITATION).toBe('exploitation');
    expect(ScannerCategory.POST_EXPLOITATION).toBe('post-exploitation');
    expect(ScannerCategory.FORENSICS).toBe('forensics');
    expect(ScannerCategory.REVERSE_ENGINEERING).toBe('reverse-engineering');
    expect(ScannerCategory.MISC).toBe('misc');
  });
});
