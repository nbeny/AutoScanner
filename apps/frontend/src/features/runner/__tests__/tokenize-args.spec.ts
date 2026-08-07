// apps/frontend/src/features/runner/__tests__/tokenize-args.spec.ts
import { describe, expect, it } from 'vitest';
import { tokenizeArgs } from '../tokenize-args';

describe('tokenizeArgs', () => {
  it('splits on whitespace', () => {
    expect(tokenizeArgs('-sV -p 80 scanme.example.com')).toEqual([
      '-sV',
      '-p',
      '80',
      'scanme.example.com',
    ]);
  });
  it('keeps a double-quoted span as one token, quotes stripped', () => {
    expect(tokenizeArgs('--data "a b c" -x')).toEqual(['--data', 'a b c', '-x']);
  });
  it('keeps a single-quoted span as one token', () => {
    expect(tokenizeArgs("--q 'one two'")).toEqual(['--q', 'one two']);
  });
  it('collapses extra whitespace and returns [] for blank', () => {
    expect(tokenizeArgs('   -a    -b  ')).toEqual(['-a', '-b']);
    expect(tokenizeArgs('   ')).toEqual([]);
  });
});
