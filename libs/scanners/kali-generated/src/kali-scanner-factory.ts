import { KALI_TOOLBOX_IMAGE } from '@autoscanner/common';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';
import type { KaliToolRecord } from './types';
import { KaliScannerInput, type KaliScannerInputType } from './kali-scanner-input';
import { tokenizeArgs } from './tokenize-args';

/** Literal token replaced by the run target inside `args`. */
export const TARGET_PLACEHOLDER = '{{target}}';

/** Kali metapackage category slug -> internal ScannerCategory. */
export const KALI_CATEGORY_TO_SCANNER_CATEGORY: Record<string, ScannerCategory> = {
  'information-gathering': ScannerCategory.PASSIVE_RECON,
  web: ScannerCategory.WEB_ENUM,
  vulnerability: ScannerCategory.VULN_SCAN,
  database: ScannerCategory.VULN_SCAN,
  'sniffing-spoofing': ScannerCategory.NETWORK_ANALYSIS,
  identify: ScannerCategory.SERVICE_DETECTION,
  detect: ScannerCategory.VULN_SCAN,
  fuzzing: ScannerCategory.WEB_ENUM,
  forensics: ScannerCategory.FORENSICS,
  'reverse-engineering': ScannerCategory.REVERSE_ENGINEERING,
  passwords: ScannerCategory.PASSWORD,
  wireless: ScannerCategory.WIFI,
  '802-11': ScannerCategory.WIFI,
  exploitation: ScannerCategory.EXPLOITATION,
  'post-exploitation': ScannerCategory.POST_EXPLOITATION,
  'social-engineering': ScannerCategory.OSINT,
  'windows-resources': ScannerCategory.SMB_WINDOWS,
  gpu: ScannerCategory.PASSWORD,
  bluetooth: ScannerCategory.MISC,
  voip: ScannerCategory.MISC,
  sdr: ScannerCategory.MISC,
  rfid: ScannerCategory.MISC,
  hardware: ScannerCategory.MISC,
  'crypto-stego': ScannerCategory.MISC,
  reporting: ScannerCategory.MISC,
  protect: ScannerCategory.MISC,
  recover: ScannerCategory.MISC,
  respond: ScannerCategory.MISC,
  top10: ScannerCategory.MISC,
};

/** Binaries that need raw-socket capabilities inside the hardened toolbox. */
export const KALI_TOOL_CAPS: Record<string, string[]> = {
  nmap: ['NET_RAW', 'NET_ADMIN'],
  masscan: ['NET_RAW', 'NET_ADMIN'],
  'arp-scan': ['NET_RAW', 'NET_ADMIN'],
  hping3: ['NET_RAW', 'NET_ADMIN'],
  fping: ['NET_RAW', 'NET_ADMIN'],
  netdiscover: ['NET_RAW', 'NET_ADMIN'],
  tcpdump: ['NET_RAW', 'NET_ADMIN'],
};

function mapCategories(cats: string[]): ScannerCategory[] {
  const mapped = (cats ?? []).map(
    (c) => KALI_CATEGORY_TO_SCANNER_CATEGORY[c] ?? ScannerCategory.MISC,
  );
  const unique = Array.from(new Set(mapped));
  return unique.length ? unique : [ScannerCategory.MISC];
}

/** Build one generic raw scanner definition from a Kali dataset record. */
export function buildKaliScanner(record: KaliToolRecord): ScannerDefinition<KaliScannerInputType> {
  const categories = mapCategories(record.categories);
  return {
    name: record.binary,
    displayName: record.displayName || record.binary,
    category: categories,
    primaryCategory: categories[0],
    description: record.description || `Kali tool: ${record.binary}`,
    version: record.kaliRelease,
    inputSchema: KaliScannerInput,
    docker: {
      image: KALI_TOOLBOX_IMAGE,
      network: 'bridge',
      capabilities: KALI_TOOL_CAPS[record.binary] ?? [],
      readonlyRootfs: true,
      memoryLimitMb: 1024,
      cpuQuota: 1_000_000,
      defaultTimeoutMs: 300_000,
    },
    build(input, target) {
      const tokens = tokenizeArgs(input.args);
      const hasPlaceholder = tokens.includes(TARGET_PLACEHOLDER);
      const argv = hasPlaceholder
        ? tokens.map((t) => (t === TARGET_PLACEHOLDER ? target : t))
        : target
          ? [...tokens, target]
          : tokens;
      return { cmd: [record.binary, ...argv] };
    },
    outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'raw' }],
    produces: [],
  };
}

/** Build the full scanner set from the dataset, deduped by binary. */
export function buildKaliScanners(records: KaliToolRecord[]): ScannerDefinition[] {
  const seen = new Set<string>();
  const defs: ScannerDefinition[] = [];
  for (const r of records) {
    if (!r.binary || seen.has(r.binary)) continue;
    seen.add(r.binary);
    defs.push(buildKaliScanner(r) as ScannerDefinition);
  }
  return defs;
}
