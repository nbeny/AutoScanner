import type { ScannerPreset } from '@autoscanner/scanner-sdk';

import type { KaliToolRecord } from './kali/types';

/**
 * SP2 — Editable quick-run examples per command.
 *
 * Every generic Kali scanner (input `{ target?, args?, preset? }`) gets one or
 * more named "run examples" that prefill the composer's `args` field. The chip
 * only seeds the field — the operator edits before launching.
 *
 * Sourced via a cascade: curated seed > man/help EXAMPLES > generic fallback.
 * Each example maps to a `ScannerPreset` with `options: { args }`, so the
 * existing composer chip UI renders it unchanged.
 *
 * The `{{target}}` token marks where the target belongs mid-command (e.g.
 * `nikto -host {{target}}`). Examples that omit it rely on the scanner's
 * generic `build()` appending the target at the end.
 */

export interface KaliExample {
  name: string;
  args: string;
}

/**
 * Curated examples for popular binaries. Every key MUST exist in
 * `data/kali-tools.json` (verified against the dataset).
 */
export const KALI_EXAMPLE_SEED: Record<string, KaliExample[]> = {
  nmap: [
    { name: 'Scan rapide (top 1000)', args: '-T4 --top-ports 1000' },
    { name: 'Service + version + scripts', args: '-sV -sC' },
    { name: 'Agressif tous ports', args: '-A -T4 -p-' },
  ],
  masscan: [{ name: 'Ports courants (rapide)', args: '-p1-1000 --rate 1000' }],
  netdiscover: [{ name: 'Découverte réseau (ARP)', args: '-r {{target}}' }],
  nbtscan: [{ name: 'Scan NetBIOS', args: '-v' }],
  fping: [{ name: 'Ping (alive)', args: '-a' }],
  hping3: [{ name: 'SYN sur le port 80', args: '-S -p 80 -c 3' }],

  nikto: [
    { name: 'Scan web', args: '-host {{target}}' },
    { name: 'Scan web HTTPS', args: '-host {{target}} -ssl' },
  ],
  whatweb: [
    { name: 'Fingerprint standard', args: '' },
    { name: 'Agressif (niveau 3)', args: '-a 3' },
  ],
  wafw00f: [
    { name: 'Détection WAF', args: '' },
    { name: 'Tous les tests', args: '-a' },
  ],
  wpscan: [
    { name: 'Scan WordPress', args: '--url http://{{target}}' },
    {
      name: 'Énumération (plugins/thèmes/users)',
      args: '--url http://{{target}} --enumerate vp,vt,u',
    },
  ],
  joomscan: [{ name: 'Scan Joomla', args: '--url http://{{target}}' }],
  dirb: [
    { name: 'Brute répertoires', args: 'http://{{target}}' },
    { name: 'Extensions communes', args: 'http://{{target}} -X .php,.html,.txt' },
  ],
  wfuzz: [
    {
      name: 'Fuzz répertoires',
      args: '-w /usr/share/wordlists/dirb/common.txt http://{{target}}/FUZZ',
    },
  ],
  cewl: [{ name: 'Génération de wordlist', args: '-d 2 -m 5' }],
  davtest: [{ name: 'Test WebDAV', args: '-url http://{{target}}' }],

  sqlmap: [
    { name: 'Test injection (batch)', args: '-u {{target}} --batch' },
    { name: 'Énumération des bases', args: '-u {{target}} --batch --dbs' },
  ],

  sslscan: [{ name: 'Analyse TLS', args: '' }],
  sslyze: [{ name: 'Analyse TLS', args: '' }],

  dnsenum: [{ name: 'Énumération DNS', args: '' }],
  dnsrecon: [
    { name: 'Reconnaissance standard', args: '-d {{target}}' },
    { name: 'Transfert de zone (AXFR)', args: '-d {{target}} -a' },
  ],
  dnsmap: [{ name: 'Brute sous-domaines', args: '' }],
  fierce: [{ name: 'Reconnaissance de domaine', args: '--domain {{target}}' }],
  amass: [
    { name: 'Énumération passive', args: 'enum -passive -d {{target}}' },
    { name: 'Énumération active', args: 'enum -active -d {{target}}' },
  ],
  theharvester: [{ name: 'OSINT emails/hôtes', args: '-d {{target}} -b all' }],
  dmitry: [{ name: 'Reconnaissance complète', args: '-iwns' }],

  enum4linux: [{ name: 'Énumération complète', args: '-a' }],
  smbmap: [
    { name: 'Lister les partages', args: '-H {{target}}' },
    { name: 'Parcours récursif', args: '-H {{target}} -R' },
  ],

  'snmp-check': [{ name: 'Vérification SNMP (public)', args: '-c public' }],
  onesixtyone: [{ name: 'Brute des communautés SNMP', args: '' }],
  'ike-scan': [{ name: 'Scan IKE/VPN', args: '-M' }],

  hydra: [
    { name: 'Brute SSH', args: '-l root -P /usr/share/wordlists/rockyou.txt {{target}} ssh' },
  ],
  medusa: [
    { name: 'Brute SSH', args: '-h {{target}} -u root -P /usr/share/wordlists/rockyou.txt -M ssh' },
  ],

  'smtp-user-enum': [
    {
      name: 'Énumération utilisateurs (VRFY)',
      args: '-M VRFY -U /usr/share/wordlists/metasploit/unix_users.txt -t {{target}}',
    },
  ],
  swaks: [{ name: 'Test SMTP', args: '--server {{target}}' }],
};

/** Slugify a name into a stable kebab-case id (diacritics stripped). */
function kebab(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Best-effort extraction of run examples from man/help text.
 *
 * Prefers an `EXAMPLES` section; within it (or, as a fallback, anywhere in the
 * text) it keeps lines that invoke `binary` — either at line start or after a
 * shell prompt (`#`/`$`). The prompt and the leading `binary` token are
 * stripped; the remaining args become the example. Caps at 3, dedupes, and
 * returns `[]` when nothing parseable is found.
 */
export function parseManExamples(text: string | null | undefined, binary: string): KaliExample[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);

  // Locate an EXAMPLES section; if present, scan only until the next heading.
  const startIdx = lines.findIndex((l) => /^\s*EXAMPLES\b/i.test(l));
  let scan: string[];
  if (startIdx >= 0) {
    const rest = lines.slice(startIdx + 1);
    // A new all-caps heading (e.g. "TARGET SPECIFICATION") ends the section.
    const endRel = rest.findIndex((l) => /^[A-Z][A-Z0-9 ]{3,}$/.test(l.trim()));
    scan = endRel >= 0 ? rest.slice(0, endRel) : rest;
  } else {
    scan = lines;
  }

  const bin = escapeRegExp(binary);
  // Matches: optional prose, then (start-of-command | prompt) + binary + args.
  // Group 1 = args after the binary token (may be empty).
  const cmd = new RegExp(`(?:^|[#$]\\s*)${bin}(?:\\s+(\\S.*))?$`);

  const out: KaliExample[] = [];
  const seen = new Set<string>();
  for (const raw of scan) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(cmd);
    if (!m) continue;
    const args = (m[1] ?? '').trim();
    if (seen.has(args)) continue;
    seen.add(args);
    out.push({ name: `Exemple ${out.length + 1}`, args });
    if (out.length >= 3) break;
  }
  return out;
}

function toPreset(ex: KaliExample, description: string): ScannerPreset {
  return {
    id: kebab(ex.name) || 'exemple',
    name: ex.name,
    description,
    options: { args: ex.args },
  };
}

/**
 * Build the editable run examples for a Kali tool record, following the
 * cascade: curated seed > parsed man/help EXAMPLES > single generic fallback.
 */
export function buildKaliExamples(record: KaliToolRecord): ScannerPreset[] {
  const seeded = KALI_EXAMPLE_SEED[record.binary];
  if (seeded?.length) {
    return seeded.map((ex) => toPreset(ex, `Recette : ${record.binary} ${ex.args}`.trim()));
  }

  const parsed = parseManExamples(record.manTextRaw ?? record.helpTextRaw, record.binary);
  if (parsed.length) {
    return parsed.map((ex) => toPreset(ex, 'Exemple issu de la documentation (man/help)'));
  }

  return [
    { id: 'defaut', name: 'Défaut', description: 'Lancer sur la cible', options: { args: '' } },
  ];
}
