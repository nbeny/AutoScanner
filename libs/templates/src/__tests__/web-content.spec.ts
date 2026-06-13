import { BUILTIN_TEMPLATES } from '../builtins';
import { WebContent } from '../builtins/web-content';

describe('web-content template', () => {
  it('is registered in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toContain('web-content');
  });
  it('probes then crawls/archives/fuzzes over the discovered subdomain set', () => {
    expect(WebContent.name).toBe('web-content');
    expect(WebContent.steps.map((s) => s.scannerName)).toEqual(['httpx', 'katana', 'gau', 'ffuf']);
    for (const s of WebContent.steps) {
      expect(s.target).toEqual({ kind: 'context', path: 'subdomains' });
    }
  });
  it('enables httpx techDetect', () => {
    const httpx = WebContent.steps.find((s) => s.scannerName === 'httpx')!;
    expect(httpx.inputs).toEqual({ techDetect: { kind: 'static', value: true } });
  });
});
