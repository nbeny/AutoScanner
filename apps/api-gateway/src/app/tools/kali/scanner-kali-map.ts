/**
 * Scanner name -> underlying Kali binary, for the cases where they differ
 * (wrappers / meta-scanners). Derived from the "underlying tool" column of
 * scanner.md. Scanners whose name already equals the binary are resolved by
 * dataset lookup and need no entry here.
 */
export const SCANNER_KALI_OVERRIDES: Record<string, string> = {
  'smb-enum': 'enum4linux-ng',
  'api-discovery': 'kiterunner',
  favicon: 'httpx',
  'js-recon': 'linkfinder',
  'exposed-config': 'nuclei',
  'web-dast': 'nuclei',
  'sqli-scan': 'sqlmap',
  'cmdi-scan': 'commix',
  'xss-scan': 'dalfox',
  'smtp-recon': 'nmap',
};
