import { BUILTIN_TEMPLATES, ReconPassive, TemplateRegistry } from '../index';

describe('builtin templates', () => {
  describe('ReconPassive', () => {
    it('declares name, displayName, description and 2 steps', () => {
      expect(ReconPassive.name).toBe('recon-passive');
      expect(ReconPassive.displayName).toBe('Passive Recon');
      expect(typeof ReconPassive.description).toBe('string');
      expect(ReconPassive.description.length).toBeGreaterThan(0);
      expect(ReconPassive.steps).toHaveLength(2);
    });

    it('chains subfinder then httpx with the right context references', () => {
      const [subfinder, httpx] = ReconPassive.steps;

      expect(subfinder.scannerName).toBe('subfinder');
      expect(subfinder.target).toEqual({ kind: 'context', path: 'target' });
      expect(subfinder.inputs['sources']).toEqual({ kind: 'static', value: [] });
      expect(subfinder.inputs['recursive']).toEqual({ kind: 'static', value: false });

      expect(httpx.scannerName).toBe('httpx');
      expect(httpx.target).toEqual({ kind: 'context', path: 'subdomains' });
      expect(httpx.inputs['techDetect']).toEqual({ kind: 'static', value: true });
    });
  });

  describe('BUILTIN_TEMPLATES', () => {
    it('contains ReconPassive', () => {
      expect(BUILTIN_TEMPLATES).toContain(ReconPassive);
    });

    it('can be registered into a TemplateRegistry and retrieved by name', () => {
      const registry = new TemplateRegistry();
      for (const def of BUILTIN_TEMPLATES) {
        registry.register(def);
      }

      const retrieved = registry.get('recon-passive');
      expect(retrieved).toBe(ReconPassive);
      expect(retrieved.steps).toHaveLength(2);
    });
  });
});
