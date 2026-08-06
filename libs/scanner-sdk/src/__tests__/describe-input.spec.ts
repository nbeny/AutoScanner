import { z } from 'zod';

import { describeScannerInput, type ScannerFieldDescriptor } from '../describe-input';

function byName(fields: ScannerFieldDescriptor[]): Map<string, ScannerFieldDescriptor> {
  return new Map(fields.map((f) => [f.name, f]));
}

describe('describeScannerInput', () => {
  it('flattens the nmap-shaped schema (string/bool/number/arrays with defaults)', () => {
    const schema = z.object({
      ports: z.string().default('1-1000'),
      serviceDetection: z.boolean().default(true),
      osDetection: z.boolean().default(false),
      timingTemplate: z.number().int().min(0).max(5).default(4),
      scripts: z.array(z.string()).default([]),
      customArgs: z.array(z.string()).default([]),
    });

    const fields = byName(describeScannerInput(schema));

    expect(fields.get('ports')).toMatchObject({
      type: 'string',
      required: false,
      default: '1-1000',
    });
    expect(fields.get('serviceDetection')).toMatchObject({ type: 'boolean', default: true });
    expect(fields.get('timingTemplate')).toMatchObject({
      type: 'number',
      min: 0,
      max: 5,
      default: 4,
      required: false,
    });
    expect(fields.get('scripts')).toMatchObject({ type: 'string[]', default: [] });
  });

  it('captures numeric bounds (httpx-shaped number[] + bounded number)', () => {
    const schema = z.object({
      ports: z.array(z.number().int()).default([80, 443]),
      timeout: z.number().int().min(1).max(60).default(10),
    });

    const fields = byName(describeScannerInput(schema));

    expect(fields.get('ports')).toMatchObject({ type: 'number[]', default: [80, 443] });
    expect(fields.get('timeout')).toMatchObject({ type: 'number', min: 1, max: 60, default: 10 });
  });

  it('marks .optional() fields with no default as required=false and default=undefined', () => {
    const severity = z.enum(['info', 'low', 'medium', 'high', 'critical']);
    const schema = z.object({
      severity: z.array(severity).optional(),
      tags: z.array(z.string()).optional(),
    });

    const fields = byName(describeScannerInput(schema));

    expect(fields.get('severity')).toMatchObject({
      type: 'enum[]',
      required: false,
      default: undefined,
      enumValues: ['info', 'low', 'medium', 'high', 'critical'],
    });
    expect(fields.get('tags')).toMatchObject({
      type: 'string[]',
      required: false,
      default: undefined,
    });
  });

  it('exposes enum values for a scalar enum field', () => {
    const schema = z.object({ mode: z.enum(['fast', 'deep']).default('fast') });
    const [mode] = describeScannerInput(schema);
    expect(mode).toMatchObject({ type: 'enum', enumValues: ['fast', 'deep'], default: 'fast' });
  });

  it('reads .describe() text when present', () => {
    const schema = z.object({
      wordlist: z.string().default('/etc/ffuf/content.txt').describe('Path to the wordlist'),
    });
    const [wordlist] = describeScannerInput(schema);
    expect(wordlist.description).toBe('Path to the wordlist');
  });

  it('returns an empty list for a credential-only scanner (z.object({}))', () => {
    expect(describeScannerInput(z.object({}))).toEqual([]);
  });

  it('returns an empty list for a non-object schema', () => {
    expect(describeScannerInput(z.string())).toEqual([]);
  });
});
