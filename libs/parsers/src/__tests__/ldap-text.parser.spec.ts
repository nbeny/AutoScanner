import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LdapTextParser } from '../ldap-text/ldap-text.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'ldap-sample.txt'), 'utf8');
const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'ldap-enum',
  target: 'corp.local',
  engagementId: 'eng_1',
};

describe('LdapTextParser', () => {
  const parser = new LdapTextParser();

  it('declares name and formats', () => {
    expect(parser.name).toBe('ldap-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('collects naming contexts into OrgMetadata and flags anonymous RootDSE access', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.orgMetadata).toHaveLength(1);
    const data = out.orgMetadata[0].data as {
      namingContexts: string[];
      defaultNamingContext?: string;
      dnsHostName?: string;
    };
    expect(data.namingContexts).toEqual(['DC=corp,DC=local', 'CN=Configuration,DC=corp,DC=local']);
    expect(data.defaultNamingContext).toBe('DC=corp,DC=local');
    expect(data.dnsHostName).toBe('dc01.corp.local');

    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].title).toBe('LDAP anonymous RootDSE accessible');
    expect(out.findings[0].severity).toBe('LOW');
  });

  it('returns empty output when nothing was returned', async () => {
    const out = await parser.parse('', ctx);
    expect(out.orgMetadata).toHaveLength(0);
    expect(out.findings).toHaveLength(0);
  });
});
