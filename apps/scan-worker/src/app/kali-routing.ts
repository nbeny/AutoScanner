import { KALI_TOOLBOX_IMAGE } from '@autoscanner/common';

/**
 * Scanners verified to run correctly inside the Kali toolbox image. Excludes
 * name-collisions (httpx → Kali ships Python httpx; favicon uses httpx) and
 * template/asset-dependent tools (nuclei, exposed-config, web-dast) because those
 * exit 0 with wrong/empty output — the 126/127 fallback cannot catch them.
 * nmap/masscan are included on purpose: their file-caps block exec in the sandbox
 * (exit 126/127), which the fallback DOES catch, re-running them on their own image.
 */
export const KALI_TOOLBOX_ALLOWLIST: ReadonlySet<string> = new Set([
  'nmap',
  'masscan',
  'sslscan',
  'whatweb',
  'nikto',
  'dnsrecon',
  'ffuf',
  'feroxbuster',
  'wpscan',
  'gobuster',
  'onesixtyone',
  'amass',
  'sqli-scan',
  'cmdi-scan',
  'snmp-recon',
  'smtp-recon',
]);

export interface ScanImageChoice {
  image: string;
  /** The scanner's own image, used to retry if the toolbox can't exec the binary. */
  fallbackImage: string | null;
  usesKali: boolean;
}

/** Pick the image a scanner runs in: the toolbox when allowlisted, else its own. */
export function resolveScanImage(scannerName: string, ownImage: string): ScanImageChoice {
  if (KALI_TOOLBOX_ALLOWLIST.has(scannerName)) {
    return { image: KALI_TOOLBOX_IMAGE, fallbackImage: ownImage, usesKali: true };
  }
  return { image: ownImage, fallbackImage: null, usesKali: false };
}

/**
 * True only for container exit 126 (not executable) / 127 (not found) — the
 * toolbox lacking or being unable to exec the binary. A normal tool non-zero
 * exit (1, 2, …) is NOT an exec failure and must not trigger a fallback.
 */
export function isExecFailure(exitCode: number): boolean {
  return exitCode === 126 || exitCode === 127;
}
