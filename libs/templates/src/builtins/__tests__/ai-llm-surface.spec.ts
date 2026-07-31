import { AiLlmSurface } from '../ai-llm-surface';
import { BUILTIN_TEMPLATES } from '../index';

describe('AiLlmSurface template', () => {
  it('appears in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toContain('ai-llm-surface');
  });

  it('declares name, displayName, description and 2 steps', () => {
    expect(AiLlmSurface.name).toBe('ai-llm-surface');
    expect(AiLlmSurface.displayName).toMatch(/AI|LLM/);
    expect(typeof AiLlmSurface.description).toBe('string');
    expect(AiLlmSurface.description.length).toBeGreaterThan(0);
    expect(AiLlmSurface.steps).toHaveLength(2);
  });

  it('chains llm-recon then llm-attack in order', () => {
    expect(AiLlmSurface.steps.map((s) => s.scannerName)).toEqual(['llm-recon', 'llm-attack']);
  });

  it('both steps target the engagement root with empty inputs', () => {
    for (const step of AiLlmSurface.steps) {
      expect(step.target).toEqual({ kind: 'context', path: 'target' });
      expect(step.inputs).toEqual({});
    }
  });

  it('exposes a scope-acknowledgement banner about active LLM probing', () => {
    expect(AiLlmSurface.scopeAcknowledgement).toMatch(/llm-attack|llm|prompt/i);
  });

  it('does not include jwt-tool or garak (excluded: no-op / needs live endpoint)', () => {
    const names = AiLlmSurface.steps.map((s) => s.scannerName);
    expect(names).not.toContain('jwt-tool');
    expect(names).not.toContain('garak');
  });
});
