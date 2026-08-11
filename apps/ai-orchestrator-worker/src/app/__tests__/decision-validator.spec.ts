import { z } from 'zod';
import { ScannerRegistry, ScannerCategory, type ScannerDefinition } from '@autoscanner/scanner-sdk';

import { validateDecision } from '../decision-validator';

/** Generic Kali scanner: input schema is `{ target?, args?, preset? }`. */
function fakeKaliTool(name: string): ScannerDefinition {
  return {
    name,
    displayName: name,
    category: [ScannerCategory.PORT_SCAN],
    description: 'fake',
    inputSchema: z.object({
      target: z.string().optional(),
      args: z.string().optional(),
      preset: z.string().optional(),
    }),
    docker: {
      image: 'x',
      network: 'bridge',
      capabilities: [],
      readonlyRootfs: true,
      memoryLimitMb: 128,
      cpuQuota: 1,
      defaultTimeoutMs: 1000,
    },
    build: () => ({ cmd: [name] }),
    outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'raw' }],
    produces: [],
  };
}

function makeRegistry(): ScannerRegistry {
  const r = new ScannerRegistry();
  r.register(fakeKaliTool('nmap'));
  return r;
}

describe('validateDecision', () => {
  it('accepts a decision carrying an args string and drops unknown scanners', () => {
    const decision = validateDecision(
      {
        done: false,
        rationale: 'go',
        next: [
          { scannerName: 'nmap', target: '10.0.0.1', args: '-sV', why: 'scan' },
          { scannerName: 'does-not-exist', target: '10.0.0.1', args: '', why: 'nope' },
        ],
      },
      makeRegistry(),
    );

    expect(decision.done).toBe(false);
    expect(decision.rationale).toBe('go');
    expect(decision.next).toHaveLength(1);
    expect(decision.next[0]).toMatchObject({
      scannerName: 'nmap',
      target: '10.0.0.1',
      args: '-sV',
    });
  });

  it('defaults args to an empty string when absent', () => {
    const decision = validateDecision(
      { next: [{ scannerName: 'nmap', target: '10.0.0.1', why: 'default' }] },
      makeRegistry(),
    );
    expect(decision.next).toHaveLength(1);
    expect(decision.next[0].args).toBe('');
  });

  it('passes a preset through when present', () => {
    const decision = validateDecision(
      { next: [{ scannerName: 'nmap', target: '10.0.0.1', args: '', preset: 'quick', why: 'p' }] },
      makeRegistry(),
    );
    expect(decision.next[0].preset).toBe('quick');
  });

  it('honours done:true with empty next', () => {
    const decision = validateDecision({ done: true, next: [] }, makeRegistry());
    expect(decision.done).toBe(true);
    expect(decision.next).toEqual([]);
  });

  it('drops entries with a missing or empty target', () => {
    const decision = validateDecision(
      {
        next: [
          { scannerName: 'nmap', target: '', args: '', why: 'empty' },
          { scannerName: 'nmap', args: '', why: 'missing' },
        ],
      },
      makeRegistry(),
    );
    expect(decision.next).toEqual([]);
  });

  it.each([null, 'x', {}, 42, undefined])('returns a safe decision for garbage: %p', (raw) => {
    const decision = validateDecision(raw, makeRegistry());
    expect(decision).toEqual({ done: false, rationale: '', next: [] });
  });
});
