import { looksLikeTarget, MAX_ARGS, MAX_ARG_LEN } from '../validate-kali-run';

describe('validate-kali-run', () => {
  it('flags host/ip/url args as targets', () => {
    expect(looksLikeTarget('scanme.example.com')).toBe(true);
    expect(looksLikeTarget('10.0.0.1')).toBe(true);
    expect(looksLikeTarget('https://x.example.com/a')).toBe(true);
    expect(looksLikeTarget('-sV')).toBe(false);
    expect(looksLikeTarget('top-100')).toBe(false);
  });
  it('exposes caps', () => {
    expect(MAX_ARGS).toBeGreaterThan(0);
    expect(MAX_ARG_LEN).toBeGreaterThan(0);
  });
});
