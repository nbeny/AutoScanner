import fc from 'fast-check';

import { canonicalDomain, canonicalIp, canonicalize, canonicalizeUrl } from '../canonical';

describe('canonicalize() — legacy parity', () => {
  describe('DOMAIN / SUBDOMAIN', () => {
    it('lowercases', () => {
      expect(canonicalize('API.Client.COM', { type: 'DOMAIN' })).toBe('api.client.com');
      expect(canonicalize('API.Client.COM', { type: 'SUBDOMAIN' })).toBe('api.client.com');
    });

    it('trims whitespace', () => {
      expect(canonicalize('  api.client.com  ', { type: 'SUBDOMAIN' })).toBe('api.client.com');
    });

    it('strips trailing dot (FQDN root)', () => {
      expect(canonicalize('api.client.com.', { type: 'SUBDOMAIN' })).toBe('api.client.com');
      expect(canonicalize('client.com.', { type: 'DOMAIN' })).toBe('client.com');
    });

    it('combines lowercase + trim + trailing-dot strip', () => {
      expect(canonicalize(' API.Client.COM. ', { type: 'SUBDOMAIN' })).toBe('api.client.com');
    });

    it('is idempotent', () => {
      const inputs = ['API.Client.com.', '  Foo.bar.  ', 'host.example.org'];
      for (const v of inputs) {
        const once = canonicalize(v, { type: 'SUBDOMAIN' });
        const twice = canonicalize(once, { type: 'SUBDOMAIN' });
        expect(twice).toBe(once);
      }
    });
  });

  describe('IP_ADDRESS', () => {
    it('passes IPv4 through unchanged (already canonical)', () => {
      expect(canonicalize('10.0.0.5', { type: 'IP_ADDRESS' })).toBe('10.0.0.5');
      expect(canonicalize('192.168.1.1', { type: 'IP_ADDRESS' })).toBe('192.168.1.1');
    });

    it('compresses IPv6 to RFC 5952 form', () => {
      expect(canonicalize('2001:DB8::1', { type: 'IP_ADDRESS' })).toBe('2001:db8::1');
    });

    it('trims whitespace', () => {
      expect(canonicalize('  10.0.0.5  ', { type: 'IP_ADDRESS' })).toBe('10.0.0.5');
    });

    it('is idempotent', () => {
      const inputs = ['10.0.0.5', '2001:DB8::1', '  192.168.1.1  '];
      for (const v of inputs) {
        const once = canonicalize(v, { type: 'IP_ADDRESS' });
        const twice = canonicalize(once, { type: 'IP_ADDRESS' });
        expect(twice).toBe(once);
      }
    });
  });
});

describe('canonicalDomain()', () => {
  it('handles IDN: Unicode input → punycode ASCII', () => {
    expect(canonicalDomain('bücher.example')).toBe('xn--bcher-kva.example');
  });

  it('keeps already-punycoded input unchanged', () => {
    expect(canonicalDomain('xn--bcher-kva.example')).toBe('xn--bcher-kva.example');
  });

  it('IDN: idempotent across two applications', () => {
    const once = canonicalDomain('Bücher.EXAMPLE.');
    const twice = canonicalDomain(once);
    expect(twice).toBe(once);
    expect(once).toBe('xn--bcher-kva.example');
  });

  it('corpus of known equivalences and inequivalences', () => {
    const equivalents: Array<[string, string]> = [
      ['API.client.com', 'api.client.com'],
      ['client.com.', 'client.com'],
      ['  api.client.com  ', 'api.client.com'],
      ['  API.Client.COM.  ', 'api.client.com'],
    ];
    for (const [input, expected] of equivalents) {
      expect(canonicalDomain(input)).toBe(expected);
    }
    // `www.client.com` and `client.com` are distinct hosts — must NOT collapse.
    expect(canonicalDomain('www.client.com')).not.toBe(canonicalDomain('client.com'));
  });

  it('property: idempotent on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = canonicalDomain(s);
        const twice = canonicalDomain(once);
        return once === twice;
      }),
    );
  });
});

describe('canonicalizeUrl()', () => {
  it('lowercases scheme+host, sorts query params, strips default port 80, strips fragment', () => {
    expect(canonicalizeUrl('HTTP://Example.com:80/Path?b=2&a=1#frag')).toBe(
      'http://example.com/Path?a=1&b=2',
    );
  });

  it('strips default https port 443, ensures trailing slash on bare host', () => {
    expect(canonicalizeUrl('https://Example.com:443')).toBe('https://example.com/');
  });

  it('preserves trailing slash in path', () => {
    expect(canonicalizeUrl('https://example.com/a/')).toBe('https://example.com/a/');
  });

  it('prepends https:// when no scheme is present', () => {
    expect(canonicalizeUrl('example.com/x')).toBe('https://example.com/x');
  });

  it('keeps non-default port', () => {
    expect(canonicalizeUrl('http://example.com:8080/y')).toBe('http://example.com:8080/y');
  });

  it('falls back to trimmed+lowercased original on invalid URL without throwing', () => {
    expect(canonicalizeUrl('   not a url   ')).toBe('not a url');
  });
});

describe('canonicalIp()', () => {
  it('compresses fully-expanded IPv6 to RFC 5952', () => {
    expect(canonicalIp('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
  });

  it('lowercases mixed-case IPv6', () => {
    expect(canonicalIp('2001:DB8::1')).toBe('2001:db8::1');
  });

  it('returns IPv4 in dotted form', () => {
    expect(canonicalIp('192.168.1.1')).toBe('192.168.1.1');
    expect(canonicalIp('10.0.0.5')).toBe('10.0.0.5');
  });

  it('compresses loopback ::1', () => {
    expect(canonicalIp('::1')).toBe('::1');
  });

  it('falls back without throwing on malformed input', () => {
    expect(canonicalIp('not-an-ip')).toBe('not-an-ip');
    expect(canonicalIp('  Bogus  ')).toBe('bogus');
  });

  it('property: idempotent on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = canonicalIp(s);
        const twice = canonicalIp(once);
        return once === twice;
      }),
    );
  });
});
