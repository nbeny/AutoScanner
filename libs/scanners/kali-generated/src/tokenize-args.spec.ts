import { tokenizeArgs } from './tokenize-args';

describe('tokenizeArgs', () => {
  it('returns [] for empty/undefined', () => {
    expect(tokenizeArgs(undefined)).toEqual([]);
    expect(tokenizeArgs('')).toEqual([]);
    expect(tokenizeArgs('   ')).toEqual([]);
  });

  it('splits on whitespace', () => {
    expect(tokenizeArgs('-sV -p 80,443')).toEqual(['-sV', '-p', '80,443']);
  });

  it('honors double and single quotes', () => {
    expect(tokenizeArgs('--header "User-Agent: x y"')).toEqual(['--header', 'User-Agent: x y']);
    expect(tokenizeArgs("--q 'a b'")).toEqual(['--q', 'a b']);
  });
});
