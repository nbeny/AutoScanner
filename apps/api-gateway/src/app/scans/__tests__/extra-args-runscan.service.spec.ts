import { z } from 'zod';
import { ScansService } from '../scans.service';

describe('ScansService — préservation extraArgs', () => {
  it('sépare extraArgs de la validation puis le réattache', () => {
    const svc = Object.create(ScansService.prototype) as ScansService;
    const scanner = { name: 'nmap', inputSchema: z.object({ ports: z.string().optional() }) };
    const merge = (
      svc as unknown as {
        mergeValidatedInput: (s: unknown, raw: unknown) => unknown;
      }
    ).mergeValidatedInput.bind(svc);

    const out = merge(scanner, { ports: '80', extraArgs: ['-sC', ''], bogus: 1 });
    expect(out).toEqual({ ports: '80', extraArgs: ['-sC'] });
  });

  it('n’ajoute pas extraArgs quand la liste est vide/absente', () => {
    const svc = Object.create(ScansService.prototype) as ScansService;
    const scanner = { name: 'nmap', inputSchema: z.object({ ports: z.string().optional() }) };
    const merge = (
      svc as unknown as {
        mergeValidatedInput: (s: unknown, raw: unknown) => unknown;
      }
    ).mergeValidatedInput.bind(svc);
    expect(merge(scanner, { ports: '80' })).toEqual({ ports: '80' });
  });
});
