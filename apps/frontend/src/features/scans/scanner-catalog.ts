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
