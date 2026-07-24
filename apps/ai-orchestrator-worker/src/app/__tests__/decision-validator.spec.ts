import { z } from 'zod';
import { ScannerRegistry, ScannerCategory, type ScannerDefinition } from '@autoscanner/scanner-sdk';

import { validateDecision } from '../decision-validator';

function fakeNmap(): ScannerDefinition {
  return {
    name: 'nmap',
    displayName: 'Nmap',
    category: [ScannerCategory.PORT_SCAN],
    description: 'fake',
    inputSchema: z.object({ ports: z.string().optional() }),
    docker: {
      image: 'x',
      network: 'host',
      capabilities: [],
      readonlyRootfs: false,
      memoryLimitMb: 128,
      cpuQuota: 1,
      defaultTimeoutMs: 1000,
    },
    build: () => ({ cmd: ['nmap'] }),
    outputs: [{ format: 'XML', capture: 'stdout', parser: 'nmap-xml' }],
    produces: ['Port'],
  };
}

function makeRegistry(): ScannerRegistry {
  const r = new ScannerRegistry();
  r.register(fakeNmap());
  return r;
}

describe('validateDecision', () => {
  it('keeps valid scans and drops unknown scanners', () => {
    const decision = validateDecision(
      {
        done: false,
        rationale: 'go',
        next: [
          { scannerName: 'nmap', target: '10.0.0.1', inputs: { ports: '1-1000' }, why: 'scan' },
          { scannerName: 'does-not-exist', target: '10.0.0.1', inputs: {}, why: 'nope' },
        ],
      },
      makeRegistry(),
    );

    expect(decision.done).toBe(false);
    expect(decision.rationale).toBe('go');
    expect(decision.next).toHaveLength(1);
    expect(decision.next[0].scannerName).toBe('nmap');
  });

  it('honours done:true with empty next', () => {
    const decision = validateDecision({ done: true, next: [] }, makeRegistry());
    expect(decision.done).toBe(true);
    expect(decision.next).toEqual([]);
  });

  it('drops entries whose inputs fail the scanner schema', () => {
    const decision = validateDecision(
      { next: [{ scannerName: 'nmap', target: '10.0.0.1', inputs: { ports: 123 }, why: 'bad' }] },
      makeRegistry(),
    );
    expect(decision.next).toEqual([]);
  });

  it('drops entries with a missing or empty target', () => {
    const decision = validateDecision(
      {
        next: [
          { scannerName: 'nmap', target: '', inputs: {}, why: 'empty' },
          { scannerName: 'nmap', inputs: {}, why: 'missing' },
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
