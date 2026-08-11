import { buildSystemPrompt, buildUserPrompt, buildAuditPrompt } from '../decision-prompt';
import type { WorldState } from '../world-state.service';

describe('decision-prompt', () => {
  it('system prompt mentions JSON, the schema keys, and the args contract', () => {
    const sys = buildSystemPrompt();
    expect(sys.length).toBeGreaterThan(0);
    expect(sys).toContain('JSON');
    expect(sys).toContain('"done"');
    expect(sys).toContain('"next"');
    // New contract: scans carry an args string, not structured inputs.
    expect(sys).toContain('"args"');
    expect(sys).toContain('{{target}}');
  });

  it('user prompt embeds target, scannersRun, raw output excerpts, catalog, budget', () => {
    const worldState: WorldState = {
      target: 'example.com',
      scannersRun: ['nmap'],
      recentOutputs: [{ scanner: 'nmap', target: 'example.com', excerpt: '443/tcp open https' }],
    };
    const prompt = buildUserPrompt({
      worldState,
      catalogText: 'nmap — Network exploration and port scanner.',
      budgetRemaining: { scans: 10, depth: 4 },
    });
    expect(prompt).toContain('example.com');
    expect(prompt).toContain('nmap');
    // The raw excerpt is rendered into the prompt.
    expect(prompt).toContain('443/tcp open https');
    expect(prompt).toContain('scans: 10');
    expect(prompt).toContain('Return the JSON decision');
  });

  it('user prompt notes when no output exists yet', () => {
    const worldState: WorldState = { target: 'example.com', scannersRun: [], recentOutputs: [] };
    const prompt = buildUserPrompt({
      worldState,
      catalogText: 'x',
      budgetRemaining: { scans: 10, depth: 4 },
    });
    expect(prompt).toContain('none yet');
  });

  it('audit prompt asks for a markdown report from findings and decisions', () => {
    const prompt = buildAuditPrompt({
      target: 'example.com',
      findings: [{ title: 'X', severity: 'HIGH' }],
      decisions: [{ round: 1, rationale: 'recon' }],
    });
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Executive Summary');
    expect(prompt).toContain('example.com');
    expect(prompt).toContain('Markdown');
  });
});
