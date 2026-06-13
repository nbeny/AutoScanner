import { categorize, FINDING_CATEGORY_RULES } from '../finding-categories';

describe('FINDING_CATEGORY_RULES coverage', () => {
  it.each<[string, string]>([
    ['Weak TLS version: tls10', 'weak-tls-protocol'],
    ['Weak SSL/TLS protocol enabled: SSLv3', 'weak-tls-protocol'],
    ['TLSv1.0 enabled on port 443', 'weak-tls-protocol'],
    ['Self-signed TLS certificate', 'self-signed-cert'],
    ['Self signed certificate detected', 'self-signed-cert'],
    ['Expired TLS certificate', 'expired-cert'],
    ['Expired SSL certificate found', 'expired-cert'],
    ['Directory listing enabled', 'directory-listing'],
    ['Directory index exposed', 'directory-listing'],
    ['Default credentials found', 'default-credentials'],
    ['Default password in use', 'default-credentials'],
    ['Weak cipher suite detected: RC4', 'weak-cipher'],
    ['Export cipher enabled', 'weak-cipher'],
    ['Admin panel exposed on /admin', 'exposed-admin-panel'],
    ['Missing X-Frame-Options header', 'missing-security-header'],
    ['Missing Strict-Transport-Security header', 'missing-security-header'],
    ['Open redirect vulnerability', 'open-redirect'],
    ['CORS misconfiguration detected', 'cors-misconfig'],
    ['.git directory exposed', 'exposed-git'],
    ['.env file exposed', 'exposed-env-file'],
  ])('categorize(%j) → %j', (title, expected) => {
    expect(categorize(title)).toBe(expected);
  });

  it('returns null for a title matching no curated rule (negative case)', () => {
    expect(categorize('SQL injection in id param')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(categorize('')).toBeNull();
  });

  it('FINDING_CATEGORY_RULES is non-empty and each entry has category + match', () => {
    expect(FINDING_CATEGORY_RULES.length).toBeGreaterThan(0);
    for (const rule of FINDING_CATEGORY_RULES) {
      expect(typeof rule.category).toBe('string');
      expect(rule.match).toBeInstanceOf(RegExp);
    }
  });
});
