import { buildSystemPrompt, buildUserPrompt, buildAuditPrompt } from '../decision-prompt';
import type { WorldState } from '../world-state.service';

describe('decision-prompt', () => {
  it('system prompt mentions JSON and the schema keys', () => {
    const sys = buildSystemPrompt();
    expect(sys.length).toBeGreaterThan(0);
    expect(sys).toContain('JSON');
    expect(sys).toContain('"done"');
    expect(sys).toContain('"next"');
  });

  it('user prompt embeds world state, catalog, budget, and the ask', () => {
    const worldState: WorldState = {
      target: 'example.com',
      openPorts: [{ port: 443, protocol: 'TCP' }],
      services: [],
      technologies: [],
      urls: [],
      endpoints: [],
      findings: [],
      scannersRun: ['nmap'],
    };
    const prompt = buildUserPrompt({
      worldState,
      catalogText: 'nmap [port-scan] produces:{Port} inputs:{ports}',
      budgetRemaining: { scans: 10, depth: 4 },
    });
    expect(prompt).toContain('example.com');
    expect(prompt).toContain('nmap [port-scan]');
    expect(prompt).toContain('scans: 10');
    expect(prompt).toContain('Return the JSON decision');
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
