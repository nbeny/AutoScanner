export interface FindingCategoryRule {
  category: string;
  match: RegExp;
}

export const FINDING_CATEGORY_RULES: readonly FindingCategoryRule[] = [
  {
    category: 'weak-tls-protocol',
    match: /weak (ssl|tls) (protocol|version)|(ssl|tls)v1\.[01] enabled|weak ssl\/tls protocol/i,
  },
  { category: 'self-signed-cert', match: /self[- ]signed/i },
  { category: 'expired-cert', match: /expired .*certificate/i },
  { category: 'weak-cipher', match: /weak cipher|rc4|export cipher/i },
  { category: 'directory-listing', match: /directory (listing|index)/i },
  { category: 'default-credentials', match: /default (credential|password|login)/i },
  {
    category: 'exposed-admin-panel',
    match: /admin (panel|interface|console).{0,20}exposed|exposed admin/i,
  },
  {
    category: 'missing-security-header',
    match:
      /missing .*(security )?header|x-frame-options|strict-transport-security|content-security-policy/i,
  },
  { category: 'open-redirect', match: /open redirect/i },
  {
    category: 'cors-misconfig',
    match: /cors (misconfig|misconfiguration)|access-control-allow-origin: \*/i,
  },
  { category: 'exposed-git', match: /\.git (exposed|directory)|exposed \.git/i },
  { category: 'exposed-env-file', match: /\.env (file )?exposed|exposed \.env/i },
  { category: 'ssrf', match: /\bssrf\b|server[- ]side request forgery/i },
  {
    category: 'lfi',
    match: /\blfi\b|local file inclusion|path[- ]?traversal|directory traversal/i,
  },
  { category: 'xxe', match: /\bxxe\b|xml external entit/i },
  {
    category: 'ssti',
    match: /\bssti\b|server[- ]side template injection|template injection/i,
  },
];

export function categorize(title: string, templateId?: string | null): string | null {
  const hay = `${title} ${templateId ?? ''}`;
  for (const rule of FINDING_CATEGORY_RULES) {
    if (rule.match.test(hay)) return rule.category;
  }
  return null;
}
