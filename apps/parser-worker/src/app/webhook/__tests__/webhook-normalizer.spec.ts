import { normalizeWebhook, WebhookNormalizationError, hostFromUrl } from '../webhook-normalizer';

// ---------------------------------------------------------------------------
// hostFromUrl
// ---------------------------------------------------------------------------

describe('hostFromUrl', () => {
  it('extracts hostname from a valid URL', () => {
    expect(hostFromUrl('https://app.example.com/path?q=1')).toBe('app.example.com');
  });

  it('falls back to the raw string when not a valid URL', () => {
    expect(hostFromUrl('not-a-url')).toBe('not-a-url');
  });

  it('handles bare host:port URL', () => {
    expect(hostFromUrl('http://192.168.1.1:8080/page')).toBe('192.168.1.1');
  });
});

// ---------------------------------------------------------------------------
// generic source
// ---------------------------------------------------------------------------

describe('normalizeWebhook – generic', () => {
  it('maps two findings with correct fields', () => {
    const result = normalizeWebhook('generic', {
      engagementId: 'eng-1',
      findings: [
        {
          title: 'XSS',
          severity: 'HIGH',
          assetValue: 'app.example.com',
          location: 'https://app.example.com/x',
        },
        {
          title: 'SQLi',
          severity: 'critical',
          assetValue: 'db.example.com',
          cveId: 'CVE-2021-9999',
          evidence: { detail: 'payload' },
        },
      ],
    });

    expect(result.engagementId).toBe('eng-1');
    expect(result.source).toBe('generic');
    expect(result.findings).toHaveLength(2);

    const [f1, f2] = result.findings;
    expect(f1.title).toBe('XSS');
    expect(f1.severity).toBe('HIGH');
    expect(f1.assetValue).toBe('app.example.com');
    expect(f1.location).toBe('https://app.example.com/x');
    expect(f1.scannerName).toBe('webhook:generic');

    expect(f2.title).toBe('SQLi');
    expect(f2.severity).toBe('CRITICAL');
    expect(f2.assetValue).toBe('db.example.com');
    expect(f2.cveId).toBe('CVE-2021-9999');
    expect(f2.evidence).toEqual({ detail: 'payload' });
    expect(f2.scannerName).toBe('webhook:generic');
  });

  it('throws WebhookNormalizationError for unknown severity', () => {
    expect(() =>
      normalizeWebhook('generic', {
        engagementId: 'eng-1',
        findings: [{ title: 'Bad', severity: 'UNKNOWN_LEVEL', assetValue: 'host.com' }],
      }),
    ).toThrow(WebhookNormalizationError);
  });

  it('throws when engagementId is missing', () => {
    expect(() =>
      normalizeWebhook('generic', {
        findings: [{ title: 'XSS', severity: 'HIGH', assetValue: 'host.com' }],
      }),
    ).toThrow(WebhookNormalizationError);
  });

  it('throws when engagementId is empty string', () => {
    expect(() =>
      normalizeWebhook('generic', {
        engagementId: '',
        findings: [{ title: 'XSS', severity: 'HIGH', assetValue: 'host.com' }],
      }),
    ).toThrow(WebhookNormalizationError);
  });

  it('throws when findings is not an array', () => {
    expect(() =>
      normalizeWebhook('generic', {
        engagementId: 'eng-1',
        findings: 'not-an-array',
      }),
    ).toThrow(WebhookNormalizationError);
  });

  it('accepts INFO/LOW/MEDIUM/HIGH/CRITICAL case-insensitively', () => {
    const result = normalizeWebhook('generic', {
      engagementId: 'eng-1',
      findings: [
        { title: 'A', severity: 'info', assetValue: 'a.com' },
        { title: 'B', severity: 'low', assetValue: 'b.com' },
        { title: 'C', severity: 'medium', assetValue: 'c.com' },
        { title: 'D', severity: 'high', assetValue: 'd.com' },
        { title: 'E', severity: 'critical', assetValue: 'e.com' },
      ],
    });
    const severities = result.findings.map((f) => f.severity);
    expect(severities).toEqual(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  });
});

// ---------------------------------------------------------------------------
// zap source
// ---------------------------------------------------------------------------

describe('normalizeWebhook – zap', () => {
  it('maps ZAP risk levels to Severity enum values', () => {
    const result = normalizeWebhook('zap', {
      engagementId: 'eng-2',
      alerts: [
        { name: 'Cross Site Scripting', risk: 'High', url: 'https://victim.io/search?q=1' },
        { name: 'SQL Injection', risk: 'Medium', url: 'https://victim.io/login' },
        { name: 'Cookie no HttpOnly Flag', risk: 'Low', url: 'http://victim.io/' },
        {
          name: 'Server Leaks Version',
          risk: 'Informational',
          url: 'http://victim.io/',
          cweid: '200',
        },
      ],
    });

    expect(result.engagementId).toBe('eng-2');
    expect(result.source).toBe('zap');
    expect(result.findings).toHaveLength(4);

    const [high, medium, low, info] = result.findings;

    expect(high.severity).toBe('HIGH');
    expect(high.title).toBe('Cross Site Scripting');
    expect(high.assetValue).toBe('victim.io');
    expect(high.location).toBe('https://victim.io/search?q=1');
    expect(high.scannerName).toBe('webhook:zap');

    expect(medium.severity).toBe('MEDIUM');
    expect(low.severity).toBe('LOW');

    expect(info.severity).toBe('INFO');
    expect(info.title).toBe('Server Leaks Version');
    expect(info.cveId).toBeUndefined();
  });

  it('throws when alerts is not an array', () => {
    expect(() =>
      normalizeWebhook('zap', {
        engagementId: 'eng-2',
        alerts: null,
      }),
    ).toThrow(WebhookNormalizationError);
  });

  it('throws when engagementId is missing', () => {
    expect(() =>
      normalizeWebhook('zap', {
        alerts: [],
      }),
    ).toThrow(WebhookNormalizationError);
  });
});

// ---------------------------------------------------------------------------
// burp source
// ---------------------------------------------------------------------------

describe('normalizeWebhook – burp', () => {
  it('maps Burp severity levels to Severity enum values', () => {
    const result = normalizeWebhook('burp', {
      engagementId: 'eng-3',
      issues: [
        { name: 'SQL injection', severity: 'High', host: 'target.example.com', path: '/login' },
        { name: 'Stored XSS', severity: 'Medium', host: 'target.example.com', path: '/comment' },
        { name: 'Clickjacking', severity: 'Low', host: 'target.example.com' },
        {
          name: 'Password field in GET',
          severity: 'Information',
          host: 'target.example.com',
          path: '/search',
        },
      ],
    });

    expect(result.engagementId).toBe('eng-3');
    expect(result.source).toBe('burp');
    expect(result.findings).toHaveLength(4);

    const [high, medium, low, info] = result.findings;

    expect(high.severity).toBe('HIGH');
    expect(high.title).toBe('SQL injection');
    expect(high.assetValue).toBe('target.example.com');
    expect(high.location).toBe('target.example.com/login');
    expect(high.scannerName).toBe('webhook:burp');

    expect(medium.severity).toBe('MEDIUM');
    expect(medium.location).toBe('target.example.com/comment');

    expect(low.severity).toBe('LOW');
    expect(low.location).toBe('target.example.com');

    expect(info.severity).toBe('INFO');
    expect(info.location).toBe('target.example.com/search');
  });

  it('throws when issues is not an array', () => {
    expect(() =>
      normalizeWebhook('burp', {
        engagementId: 'eng-3',
        issues: {},
      }),
    ).toThrow(WebhookNormalizationError);
  });

  it('throws when engagementId is missing', () => {
    expect(() =>
      normalizeWebhook('burp', {
        issues: [],
      }),
    ).toThrow(WebhookNormalizationError);
  });
});

// ---------------------------------------------------------------------------
// unknown source
// ---------------------------------------------------------------------------

describe('normalizeWebhook – unknown source', () => {
  it('throws WebhookNormalizationError for unknown source', () => {
    expect(() =>
      normalizeWebhook('nessus', {
        engagementId: 'eng-1',
      }),
    ).toThrow(WebhookNormalizationError);
  });

  it('throws WebhookNormalizationError for source "__proto__" (prototype-pollution guard)', () => {
    expect(() =>
      normalizeWebhook('__proto__', {
        engagementId: 'eng-1',
      }),
    ).toThrow(WebhookNormalizationError);
  });

  it('throws WebhookNormalizationError for source "constructor" (prototype-pollution guard)', () => {
    expect(() =>
      normalizeWebhook('constructor', {
        engagementId: 'eng-1',
      }),
    ).toThrow(WebhookNormalizationError);
  });
});
