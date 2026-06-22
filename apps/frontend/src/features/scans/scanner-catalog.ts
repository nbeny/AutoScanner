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
