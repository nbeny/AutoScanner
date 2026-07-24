import { parseTarget } from '../src';

describe('parseTarget', () => {
  it('classifies a single IPv4 address', () => {
    const result = parseTarget('192.168.1.10');
    expect(result.kind).toBe('ipv4');
    expect(result.strategy).toBe('SINGLE_HOST');
    expect(result.normalized).toBe('192.168.1.10');
  });

  it('classifies a single IPv6 address', () => {
    const result = parseTarget('2001:db8::1');
    expect(result.kind).toBe('ipv6');
    expect(result.strategy).toBe('SINGLE_HOST');
  });

  it('classifies an IPv4 CIDR block', () => {
    const result = parseTarget('10.0.0.0/24');
    expect(result.kind).toBe('ipv4-cidr');
    expect(result.strategy).toBe('RANGE_PER_HOST');
  });

  it('classifies an IPv6 CIDR block', () => {
    const result = parseTarget('2001:db8::/120');
    expect(result.kind).toBe('ipv6-cidr');
    expect(result.strategy).toBe('RANGE_PER_HOST');
  });

  it('classifies an IPv4 range', () => {
    const result = parseTarget('10.0.0.1-10.0.0.50');
    expect(result.kind).toBe('ipv4-range');
    expect(result.strategy).toBe('RANGE_PER_HOST');
  });

  it('marks a non-IP string as invalid', () => {
    expect(parseTarget('not-an-ip').kind).toBe('invalid');
  });

  it('marks an out-of-range octet as invalid', () => {
    expect(parseTarget('999.1.1.1').kind).toBe('invalid');
  });

  it('marks an empty string as invalid', () => {
    expect(parseTarget('').kind).toBe('invalid');
  });
});
