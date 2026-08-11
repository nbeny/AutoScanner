import type { TemplateStep } from '@autoscanner/templates';
import { ContextBuilder, type TemplateRunLike } from '../context-builder.service';

const run: TemplateRunLike = { id: 'run_1', engagementId: 'eng_1', target: 'example.com' };

const step: TemplateStep = { scannerName: 'nmap', args: '-sV -Pn' };

describe('ContextBuilder (SP3a linear playlists)', () => {
  const builder = new ContextBuilder();

  it('resolves every step to the run root target', async () => {
    await expect(builder.buildTargets(step, run, 0)).resolves.toEqual(['example.com']);
  });

  it('ignores stepIndex — later steps still target the root', async () => {
    await expect(builder.buildTargets(step, run, 5)).resolves.toEqual(['example.com']);
  });

  it('ignores {{target}}-token args and preset — target is always the run root', async () => {
    const withToken: TemplateStep = { scannerName: 'nikto', args: '-host {{target}}' };
    const withPreset: TemplateStep = { scannerName: 'amass', preset: 'fast' };
    await expect(builder.buildTargets(withToken, run, 2)).resolves.toEqual(['example.com']);
    await expect(builder.buildTargets(withPreset, run, 3)).resolves.toEqual(['example.com']);
  });

  it('returns the exact target string for a different run', async () => {
    const other: TemplateRunLike = { id: 'r2', engagementId: 'e2', target: '10.0.0.5' };
    await expect(builder.buildTargets(step, other, 1)).resolves.toEqual(['10.0.0.5']);
  });
});
