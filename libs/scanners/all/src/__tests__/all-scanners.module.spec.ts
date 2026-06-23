import { Test } from '@nestjs/testing';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '../all-scanners.module';

describe('AllScannersModule', () => {
  it('registers every bundled scanner in the ScannerRegistry', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ScannerSdkModule, AllScannersModule],
    }).compile();
    await moduleRef.init();

    const registry = moduleRef.get(ScannerRegistry);
    for (const name of [
      'nmap',
      'subfinder',
      'httpx',
      'dnsx',
      'naabu',
      'nuclei',
      'findomain',
      'amass',
      'assetfinder',
      'puredns',
      'katana',
      'gau',
      'ffuf',
      'gobuster',
      'whois',
      'crtsh',
      'shodan',
      'tlsx',
      'whatweb',
      'theharvester',
      'sslscan',
      'censys',
      'asnmap',
      'cloud-enum',
      'github-subdomains',
      'trufflehog',
      'securitytrails',
      'favicon',
      'wafw00f',
      'cdncheck',
      'js-recon',
      'gowitness',
      'smtp-recon',
      'snmp-recon',
      'smb-enum',
      'api-discovery',
      'xss-scan',
      'sqli-scan',
      'cmdi-scan',
      'web-dast',
      'ssti-scan',
      'zap-scan',
      'openvas-scan',
    ]) {
      expect(registry.has(name)).toBe(true);
    }
  });
});
