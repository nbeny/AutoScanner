import { describe, expect, it } from 'vitest';
import { curateKaliTools, type KaliToolRow } from '../kali-cockpit-catalog';

const rows: KaliToolRow[] = [
  {
    binary: 'dnsrecon',
    package: 'dnsrecon',
    displayName: 'dnsrecon',
    description: 'DNS recon',
    categories: ['information-gathering'],
    hasHelp: true,
    optionCount: 29,
  },
  {
    binary: 'apache2ctl',
    package: 'apache2',
    displayName: 'apache2ctl',
    description: 'apache',
    categories: ['web'],
    hasHelp: true,
    optionCount: 1,
  },
  {
    binary: 'a2enmod',
    package: 'apache2',
    displayName: 'a2enmod',
    description: 'apache',
    categories: ['web'],
    hasHelp: false,
    optionCount: 0,
  },
  {
    binary: 'nikto',
    package: 'nikto',
    displayName: 'nikto',
    description: 'web scan',
    categories: ['web'],
    hasHelp: true,
    optionCount: 10,
  },
  {
    binary: 'john',
    package: 'john',
    displayName: 'john',
    description: 'cracker',
    categories: ['passwords'],
    hasHelp: true,
    optionCount: 5,
  },
  {
    binary: 'theharvester',
    package: 'theharvester',
    displayName: 'theHarvester',
    description: 'osint',
    categories: ['information-gathering'],
    hasHelp: true,
    optionCount: 8,
  },
];

describe('curateKaliTools', () => {
  it('keeps RECON-category primaries and drops infra packages', () => {
    const out = curateKaliTools(rows, 'RECON').map((t) => t.binary);
    expect(out).toContain('dnsrecon');
    expect(out).toContain('nikto');
    expect(out).not.toContain('apache2ctl'); // infra package excluded
    expect(out).not.toContain('a2enmod');
    expect(out).not.toContain('john'); // passwords not a RECON category
  });

  it('collapses to one primary binary per package', () => {
    const dup: KaliToolRow[] = [
      {
        binary: 'amass',
        package: 'amass',
        displayName: 'amass',
        description: '',
        categories: ['information-gathering'],
        hasHelp: true,
        optionCount: 3,
      },
      {
        binary: 'amass-viz',
        package: 'amass',
        displayName: 'amass-viz',
        description: '',
        categories: ['information-gathering'],
        hasHelp: false,
        optionCount: 0,
      },
    ];
    const out = curateKaliTools(dup, 'RECON').filter((t) => t.package === 'amass');
    expect(out).toHaveLength(1);
    expect(out[0].binary).toBe('amass'); // binary === package wins
  });

  it('OSINT uses the curated allowlist, not categories', () => {
    const out = curateKaliTools(rows, 'OSINT').map((t) => t.binary);
    expect(out).toContain('theharvester');
    expect(out).not.toContain('nikto'); // web tool, not OSINT-allowlisted
  });
});
