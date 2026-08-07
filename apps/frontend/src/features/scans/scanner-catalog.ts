export type Category =
  | 'DNS/Subdomains'
  | 'Ports/Network'
  | 'Web/HTTP'
  | 'TLS'
  | 'OSINT'
  | 'Cloud'
  | 'Active Directory'
  | 'Vuln/Exploit'
  | 'Other';

type CatalogCategory = Exclude<Category, 'Other'>;

export const SCANNER_CATALOG: Record<CatalogCategory, string[]> = {
  'DNS/Subdomains': [
    'amass',
    'assetfinder',
    'crtsh',
    'dnsx',
    'findomain',
    'github-subdomains',
    'puredns',
    'securitytrails',
    'subfinder',
  ],
  'Ports/Network': ['asnmap', 'cdncheck', 'masscan', 'naabu', 'nmap'],
  'Web/HTTP': [
    'api-discovery',
    'arjun',
    'favicon',
    'ffuf',
    'gau',
    'gobuster',
    'gowitness',
    'httpx',
    'js-recon',
    'katana',
    'wafw00f',
    'whatweb',
  ],
  TLS: ['ssh-audit', 'sslscan', 'tlsx'],
  OSINT: ['abuseipdb', 'censys', 'greynoise', 'shodan', 'theharvester', 'trufflehog', 'whois'],
  Cloud: ['cloud-enum', 'cloudbrute', 'kube-hunter', 'kubeletctl', 's3scanner'],
  'Active Directory': [
    'kerbrute',
    'ldap-enum',
    'nbtscan',
    'rdp-sec-check',
    'smb-enum',
    'smtp-recon',
    'snmp-recon',
  ],
  'Vuln/Exploit': [
    'cmdi-scan',
    'nikto',
    'nuclei',
    'openvas-scan',
    'sqli-scan',
    'wpscan',
    'xss-scan',
  ],
};

// Build reverse lookup map at module load time
const _reverseMap = new Map<string, CatalogCategory>();
for (const [category, names] of Object.entries(SCANNER_CATALOG) as [CatalogCategory, string[]][]) {
  for (const name of names) {
    _reverseMap.set(name, category);
  }
}

export function scannerCategory(name: string): Category {
  return _reverseMap.get(name) ?? 'Other';
}

export const ALL_SCANNER_NAMES: string[] = [..._reverseMap.keys()].sort();

// ---------------------------------------------------------------------------
// Live catalogue (server-driven) — shapes returned by SCANNER_CATALOG_QUERY
// ---------------------------------------------------------------------------

export interface ScannerCatalogField {
  name: string;
  /** string | number | boolean | enum | string[] | number[] | enum[] | unknown */
  type: string;
  required: boolean;
  default: unknown;
  min: number | null;
  max: number | null;
  enumValues: string[] | null;
  description: string | null;
}

export interface ScannerCatalogEntry {
  name: string;
  displayName: string;
  description: string;
  categories: string[];
  requiresCredential: string | null;
  fields: ScannerCatalogField[];
}

/** Map a raw `ScannerCategory` enum value to a display group. */
const RAW_CATEGORY_TO_GROUP: Record<string, Category> = {
  'network-discovery': 'Ports/Network',
  'port-scan': 'Ports/Network',
  'service-detection': 'Ports/Network',
  'network-analysis': 'Ports/Network',
  dns: 'DNS/Subdomains',
  'subdomain-enum': 'DNS/Subdomains',
  'web-fingerprint': 'Web/HTTP',
  'web-enum': 'Web/HTTP',
  'api-security': 'Web/HTTP',
  'vuln-scan': 'Vuln/Exploit',
  'ssl-tls': 'TLS',
  'smb-windows': 'Active Directory',
  'active-directory': 'Active Directory',
  smtp: 'Active Directory',
  snmp: 'Active Directory',
  cloud: 'Cloud',
  'container-k8s': 'Cloud',
  osint: 'OSINT',
  'identity-osint': 'OSINT',
  'passive-recon': 'OSINT',
  'breach-intel': 'OSINT',
  wifi: 'Other',
  password: 'Other',
  'iot-ics': 'Other',
  'ai-llm': 'Other',
  'import-only': 'Other',
};

/** Pick a display group from a scanner's (raw) category list. */
export function groupForCategories(rawCategories: readonly string[]): Category {
  for (const raw of rawCategories) {
    const group = RAW_CATEGORY_TO_GROUP[raw];
    if (group) return group;
  }
  return 'Other';
}

// ---------------------------------------------------------------------------
// Target-type applicability (domain / IP / URL / …)
//
// The scanner contract (`ScannerDefinition`) carries NO target-type field — the
// target is a free string each `build()` interprets. This map is an **inferred**
// heuristic (mirrors scanner.md / the scanner atlas) used only to filter the
// quick-launch selector so a domain doesn't surface IP-only tools (and vice
// versa). Scanners absent from the map are treated as accepting any target.
// ---------------------------------------------------------------------------

export type TargetType =
  | 'domain'
  | 'ip'
  | 'cidr'
  | 'url'
  | 'email'
  | 'username'
  | 'phone'
  | 'bucket'
  | 'repo'
  | 'asn';

export const SCANNER_TARGETS: Record<string, TargetType[]> = {
  // OSINT / passive
  abuseipdb: ['ip'],
  censys: ['domain', 'ip'],
  chaos: ['domain'],
  'cloud-enum': ['domain', 'bucket'],
  crtsh: ['domain'],
  dnstwist: ['domain'],
  emailfinder: ['domain'],
  emailrep: ['email'],
  fofa: ['domain', 'ip'],
  'gcp-bucket-brute': ['bucket'],
  'github-subdomains': ['domain'],
  gitleaks: ['repo'],
  greynoise: ['ip'],
  holehe: ['email'],
  internetdb: ['ip'],
  maigret: ['username'],
  mailspoof: ['domain'],
  metabigor: ['asn', 'ip'],
  msftrecon: ['domain'],
  phoneinfoga: ['phone'],
  sherlock: ['username'],
  shodan: ['ip'],
  socialscan: ['email', 'username'],
  spiderfoot: ['domain', 'ip', 'email'],
  spoofy: ['domain'],
  theharvester: ['domain'],
  trufflehog: ['repo'],
  uncover: ['domain', 'ip'],
  urlfinder: ['domain'],
  whois: ['domain', 'ip'],
  // breach intel
  h8mail: ['email'],
  leakix: ['domain', 'ip'],
  intelx: ['email', 'domain'],
  // DNS / subdomains
  amass: ['domain'],
  subfinder: ['domain'],
  assetfinder: ['domain'],
  findomain: ['domain'],
  puredns: ['domain'],
  alterx: ['domain'],
  dnsx: ['domain'],
  dnsrecon: ['domain'],
  cero: ['domain', 'ip'],
  subzy: ['domain'],
  securitytrails: ['domain'],
  asnmap: ['asn', 'ip', 'domain'],
  mapcidr: ['cidr'],
  cdncheck: ['domain', 'ip'],
  // ports / network
  nmap: ['ip', 'domain', 'cidr'],
  naabu: ['ip', 'domain', 'cidr'],
  masscan: ['ip', 'cidr'],
  rustscan: ['ip', 'domain'],
  'ike-scan': ['ip'],
  // web / HTTP
  httpx: ['domain', 'ip', 'url'],
  favicon: ['url'],
  whatweb: ['url', 'domain'],
  webanalyze: ['url', 'domain'],
  wafw00f: ['url', 'domain'],
  gowitness: ['url'],
  katana: ['url', 'domain'],
  gau: ['domain'],
  waymore: ['domain'],
  gospider: ['url'],
  hakrawler: ['url', 'domain'],
  cariddi: ['url', 'domain'],
  subjs: ['url', 'domain'],
  paramspider: ['domain'],
  ffuf: ['url'],
  gobuster: ['url', 'domain'],
  feroxbuster: ['url'],
  nikto: ['url', 'domain'],
  wpscan: ['url'],
  'js-recon': ['url'],
  linkfinder: ['url'],
  jsluice: ['url'],
  arjun: ['url'],
  'api-discovery': ['url'],
  kiterunner: ['url'],
  graphw00f: ['url'],
  'graphql-cop': ['url'],
  corsy: ['url'],
  // TLS / SSL
  sslscan: ['domain', 'ip'],
  tlsx: ['domain', 'ip'],
  testssl: ['url', 'domain', 'ip'],
  // vuln / DAST / injection
  nuclei: ['url', 'domain', 'ip'],
  'web-dast': ['url'],
  'zap-scan': ['url'],
  'openvas-scan': ['ip'],
  trivy: ['repo'],
  'sqli-scan': ['url'],
  'xss-scan': ['url'],
  'cmdi-scan': ['url'],
  'ssti-scan': ['url'],
  crlfuzz: ['url'],
  oralyzer: ['url'],
  smuggler: ['url'],
  pwncat: ['ip'],
  'git-dumper': ['url'],
  'exposed-config': ['url', 'domain'],
  mantra: ['url'],
  // cloud / storage
  cloudbrute: ['domain', 'bucket'],
  s3scanner: ['bucket'],
  // SMB / Windows / AD
  'smb-enum': ['ip'],
  'enum4linux-ng': ['ip'],
  nbtscan: ['ip', 'cidr'],
  kerbrute: ['domain', 'ip'],
  'ldap-enum': ['ip', 'domain'],
  // kubernetes / container
  'kube-hunter': ['ip'],
  kubeletctl: ['ip'],
  // SNMP / services
  'snmp-recon': ['ip'],
  onesixtyone: ['ip', 'cidr'],
  'ssh-audit': ['ip', 'domain'],
  'rdp-sec-check': ['ip'],
  // SMTP / mail
  'smtp-recon': ['ip', 'domain'],
  swaks: ['domain', 'ip'],
  // auth / token
  'jwt-tool': ['url'],
  'oauth-oidc': ['url'],
  'saml-recon': ['url'],
  // AI / LLM
  'llm-recon': ['url'],
  'llm-attack': ['url'],
  garak: ['url'],
};

const IPV4_RE = /^(\d{1,3})(\.\d{1,3}){3}(\/\d{1,2})?$/;
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Best-effort classification of an operator-typed target string. Returns `null`
 * when the shape is ambiguous (e.g. a bare username / keyword) — callers then
 * skip filtering and show every scanner.
 */
export function detectTargetType(raw: string): TargetType | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return 'url';
  if (EMAIL_RE.test(t)) return 'email';
  if (IPV4_RE.test(t)) return t.includes('/') ? 'cidr' : 'ip';
  // IPv6 (optionally with prefix): hex groups separated by ':'
  if (/^[0-9a-f:]+(\/\d{1,3})?$/i.test(t) && t.includes(':'))
    return t.includes('/') ? 'cidr' : 'ip';
  if (DOMAIN_RE.test(t)) return 'domain';
  return null;
}

/**
 * Whether a scanner is relevant for a detected target type. Unknown scanners and
 * a `null` (ambiguous) target always pass so nothing is hidden by accident.
 */
export function acceptsTarget(scannerName: string, detected: TargetType | null): boolean {
  if (detected === null) return true;
  const targets = SCANNER_TARGETS[scannerName];
  if (!targets) return true;
  const has = (t: TargetType) => targets.includes(t);
  switch (detected) {
    case 'ip':
    case 'cidr':
      return has('ip') || has('cidr');
    case 'domain':
      return has('domain') || has('url');
    case 'url':
      return has('url') || has('domain') || has('ip');
    default:
      return has(detected);
  }
}
