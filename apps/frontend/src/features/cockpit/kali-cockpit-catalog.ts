export interface KaliToolRow {
  binary: string;
  package: string;
  displayName: string;
  description: string;
  categories: string[];
  hasHelp: boolean;
  optionCount: number;
}

export type CockpitGroup = 'RECON' | 'OSINT';

/** Kali category → cockpit group (null = not surfaced in any cockpit). */
export const KALI_CATEGORY_GROUP: Record<string, CockpitGroup | null> = {
  'information-gathering': 'RECON',
  web: 'RECON',
  vulnerability: 'RECON',
  database: 'RECON',
  'sniffing-spoofing': 'RECON',
  identify: 'RECON',
  detect: 'RECON',
  fuzzing: 'RECON',
  // excluded from cockpits (offensive / non-recon / already covered by scanners)
  forensics: null,
  'reverse-engineering': null,
  passwords: null,
  wireless: null,
  '802-11': null,
  exploitation: null,
  'post-exploitation': null,
  bluetooth: null,
  voip: null,
  sdr: null,
  rfid: null,
  hardware: null,
  gpu: null,
  'crypto-stego': null,
  'social-engineering': null,
  reporting: null,
  'windows-resources': null,
  protect: null,
  recover: null,
  respond: null,
  top10: null,
};

/** Infra packages the category metapackages pull as deps — never real recon tools. */
export const KALI_EXCLUDE_PACKAGES: ReadonlySet<string> = new Set([
  'apache2',
  'nginx',
  'default-mysql-server',
  'mariadb-server',
  'postgresql',
  'samba',
  'snmpd',
  'ldap-utils',
  'redis-tools',
]);

/** Curated passive/identity binaries for the OSINT cockpit (no clean Kali category). */
export const KALI_OSINT_ALLOWLIST: ReadonlySet<string> = new Set([
  'theharvester',
  'whois',
  'dnsenum',
  'dmitry',
  'fierce',
  'recon-ng',
  'spiderfoot',
  'sublist3r',
  'dnsrecon',
  'dnswalk',
  'urlcrazy',
  'metagoofil',
]);

function primaryGroup(row: KaliToolRow): CockpitGroup | null {
  for (const c of row.categories) {
    const g = KALI_CATEGORY_GROUP[c];
    if (g) return g;
  }
  return null;
}

/** Curate the raw kaliTools rows into a clean, cockpit-ready list for a group. */
export function curateKaliTools(rows: KaliToolRow[], group: CockpitGroup): KaliToolRow[] {
  const inGroup = rows.filter((r) => {
    if (KALI_EXCLUDE_PACKAGES.has(r.package)) return false;
    if (group === 'OSINT') return KALI_OSINT_ALLOWLIST.has(r.binary);
    return primaryGroup(r) === 'RECON';
  });

  // One primary binary per package: prefer binary === package, else shortest name.
  const byPackage = new Map<string, KaliToolRow>();
  for (const r of inGroup) {
    const cur = byPackage.get(r.package);
    if (!cur) {
      byPackage.set(r.package, r);
      continue;
    }
    const better =
      (r.binary === r.package && cur.binary !== cur.package) ||
      (r.binary.length < cur.binary.length && cur.binary !== cur.package);
    if (better) byPackage.set(r.package, r);
  }
  // OSINT allowlist is binary-level: keep every allowlisted binary (don't collapse).
  const result = group === 'OSINT' ? inGroup : [...byPackage.values()];
  return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
