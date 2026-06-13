import { TheHarvesterScanner } from '../theharvester.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('TheHarvesterScanner', () => {
  it('declares name and displayName', () => {
    expect(TheHarvesterScanner.name).toBe('theharvester');
    expect(TheHarvesterScanner.displayName).toBe('theHarvester');
  });

  it('declares docker image', () => {
    expect(TheHarvesterScanner.docker.image).toBe('autoscanner/theharvester:1.0');
  });

  it('declares outputs with theharvester-text parser', () => {
    expect(TheHarvesterScanner.outputs).toHaveLength(1);
    expect(TheHarvesterScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'theharvester-text',
    });
  });

  it('produces Email', () => {
    expect(TheHarvesterScanner.produces).toContain('Email');
  });

  it('build() returns the correct theHarvester command', () => {
    const built = TheHarvesterScanner.build(
      TheHarvesterScanner.inputSchema.parse({}),
      'example.com',
      ctx,
    );
    expect(built.cmd).toEqual([
      'theHarvester',
      '-d',
      'example.com',
      '-b',
      'crtsh,bing,duckduckgo,otx',
    ]);
  });
});
