import { Test } from '@nestjs/testing';
import {
  ActiveDirectoryRecon,
  CloudExposure,
  BUILTIN_TEMPLATES,
  K8sRecon,
  NetworkVuln,
  OsintPassive,
  OsintPassiveDeep,
  ReconActive,
  ReconPassive,
  ReconPassiveDeep,
  ServiceRecon,
  TemplateRegistry,
  TemplatesModule,
  VulnActive,
  WebAppAudit,
  WebContent,
  WebDeep,
  WebDeepActiveInjection,
  WebEnrich,
  WebFingerprint,
  WebQuick,
} from '../index';

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

  describe('ReconActive', () => {
    it('declares name, displayName, description and 4 steps', () => {
      expect(ReconActive.name).toBe('recon-active');
      expect(ReconActive.displayName).toBe('Active Recon');
      expect(typeof ReconActive.description).toBe('string');
      expect(ReconActive.description.length).toBeGreaterThan(0);
      expect(ReconActive.steps).toHaveLength(4);
    });

    it('chains subfinder -> dnsx -> httpx -> naabu in order', () => {
      const order = ReconActive.steps.map((s) => s.scannerName);
      expect(order).toEqual(['subfinder', 'dnsx', 'httpx', 'naabu']);
    });

    it('wires each step to the correct context target and inputs', () => {
      const [subfinder, dnsx, httpx, naabu] = ReconActive.steps;

      expect(subfinder.target).toEqual({ kind: 'context', path: 'target' });
      expect(subfinder.inputs).toEqual({});

      expect(dnsx.target).toEqual({ kind: 'context', path: 'subdomains' });
      expect(dnsx.inputs).toEqual({});

      expect(httpx.target).toEqual({ kind: 'context', path: 'subdomains' });
      expect(httpx.inputs['techDetect']).toEqual({ kind: 'static', value: true });

      expect(naabu.target).toEqual({ kind: 'context', path: 'ipAddresses' });
      expect(naabu.inputs['ports']).toEqual({ kind: 'static', value: 'top-100' });
    });
  });

  describe('WebQuick', () => {
    it('declares name, displayName, description and 2 steps', () => {
      expect(WebQuick.name).toBe('web-quick');
      expect(WebQuick.displayName).toBe('Web Quick');
      expect(typeof WebQuick.description).toBe('string');
      expect(WebQuick.description.length).toBeGreaterThan(0);
      expect(WebQuick.steps).toHaveLength(2);
    });

    it('chains httpx -> naabu against the initial target / ipAddresses', () => {
      const [httpx, naabu] = WebQuick.steps;

      expect(httpx.scannerName).toBe('httpx');
      expect(httpx.target).toEqual({ kind: 'context', path: 'target' });
      expect(httpx.inputs['techDetect']).toEqual({ kind: 'static', value: true });

      expect(naabu.scannerName).toBe('naabu');
      expect(naabu.target).toEqual({ kind: 'context', path: 'ipAddresses' });
      expect(naabu.inputs['ports']).toEqual({ kind: 'static', value: 'top-100' });
    });
  });

  describe('WebDeep', () => {
    it('declares name, displayName, description and 5 steps', () => {
      expect(WebDeep.name).toBe('web-deep');
      expect(WebDeep.displayName).toBe('Web Deep');
      expect(typeof WebDeep.description).toBe('string');
      expect(WebDeep.description.length).toBeGreaterThan(0);
      expect(WebDeep.steps).toHaveLength(5);
    });

    it('chains subfinder -> dnsx -> httpx -> naabu -> nuclei in order', () => {
      const order = WebDeep.steps.map((s) => s.scannerName);
      expect(order).toEqual(['subfinder', 'dnsx', 'httpx', 'naabu', 'nuclei']);
    });

    it('wires nuclei against the urls context with empty inputs (default policy)', () => {
      const nuclei = WebDeep.steps[4];
      expect(nuclei.target).toEqual({ kind: 'context', path: 'urls' });
      expect(nuclei.inputs).toEqual({});
    });

    it('wires the recon part identically to ReconActive', () => {
      const [subfinder, dnsx, httpx, naabu] = WebDeep.steps;

      expect(subfinder.target).toEqual({ kind: 'context', path: 'target' });
      expect(dnsx.target).toEqual({ kind: 'context', path: 'subdomains' });
      expect(httpx.target).toEqual({ kind: 'context', path: 'subdomains' });
      expect(httpx.inputs['techDetect']).toEqual({ kind: 'static', value: true });
      expect(naabu.target).toEqual({ kind: 'context', path: 'ipAddresses' });
      expect(naabu.inputs['ports']).toEqual({ kind: 'static', value: 'top-100' });
    });
  });

  describe('WebDeepActiveInjection', () => {
    it('declares name, displayName, description and 9 steps', () => {
      expect(WebDeepActiveInjection.name).toBe('web-deep-active-injection');
      expect(WebDeepActiveInjection.displayName).toBe('Web Deep — Active Injection');
      expect(typeof WebDeepActiveInjection.description).toBe('string');
      expect(WebDeepActiveInjection.description.length).toBeGreaterThan(0);
      expect(WebDeepActiveInjection.steps).toHaveLength(9);
    });

    it('crawls then fans the injection scanners out over the endpoints context', () => {
      const order = WebDeepActiveInjection.steps.map((s) => s.scannerName);
      expect(order).toEqual([
        'subfinder',
        'httpx',
        'katana',
        'arjun',
        'web-dast',
        'sqli-scan',
        'ssti-scan',
        'xss-scan',
        'cmdi-scan',
      ]);

      // katana crawls live hosts; every injection scanner targets endpoints.
      const katana = WebDeepActiveInjection.steps[2];
      expect(katana.target).toEqual({ kind: 'context', path: 'urls' });
      for (const injector of WebDeepActiveInjection.steps.slice(3)) {
        expect(injector.target).toEqual({ kind: 'context', path: 'endpoints' });
      }
    });
  });

  describe('BUILTIN_TEMPLATES', () => {
    it('contains the 4 Phase 2 templates + recon-passive-deep + web-content + osint-passive + web-fingerprint + osint-passive-deep + web-enrich + service-recon + vuln-active + network-vuln + web-app-audit + active-directory-recon + k8s-recon + cloud-exposure + ip-passive-intel + ip-active-audit + ip-recon-full', () => {
      expect(BUILTIN_TEMPLATES).toHaveLength(21);
      expect(BUILTIN_TEMPLATES).toContain(ReconPassive);
      expect(BUILTIN_TEMPLATES).toContain(ReconActive);
      expect(BUILTIN_TEMPLATES).toContain(ReconPassiveDeep);
      expect(BUILTIN_TEMPLATES).toContain(WebQuick);
      expect(BUILTIN_TEMPLATES).toContain(WebDeep);
      expect(BUILTIN_TEMPLATES).toContain(WebContent);
      expect(BUILTIN_TEMPLATES).toContain(OsintPassive);
      expect(BUILTIN_TEMPLATES).toContain(WebFingerprint);
      expect(BUILTIN_TEMPLATES).toContain(OsintPassiveDeep);
      expect(BUILTIN_TEMPLATES).toContain(WebEnrich);
      expect(BUILTIN_TEMPLATES).toContain(ServiceRecon);
      expect(BUILTIN_TEMPLATES).toContain(VulnActive);
      expect(BUILTIN_TEMPLATES).toContain(NetworkVuln);
      expect(BUILTIN_TEMPLATES).toContain(WebAppAudit);
      expect(BUILTIN_TEMPLATES).toContain(ActiveDirectoryRecon);
      expect(BUILTIN_TEMPLATES).toContain(K8sRecon);
      expect(BUILTIN_TEMPLATES).toContain(CloudExposure);
    });

    it('exposes unique template names', () => {
      const names = BUILTIN_TEMPLATES.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('can be registered into a TemplateRegistry and retrieved by name', () => {
      const registry = new TemplateRegistry();
      for (const def of BUILTIN_TEMPLATES) {
        registry.register(def);
      }

      expect(registry.get('recon-passive')).toBe(ReconPassive);
      expect(registry.get('recon-active')).toBe(ReconActive);
      expect(registry.get('web-quick')).toBe(WebQuick);
      expect(registry.get('web-deep')).toBe(WebDeep);
      expect(registry.get('web-deep-active-injection')).toBe(WebDeepActiveInjection);
      expect(registry.get('service-recon')).toBe(ServiceRecon);
      expect(registry.get('vuln-active')).toBe(VulnActive);
      expect(registry.get('network-vuln')).toBe(NetworkVuln);

      expect(registry.list()).toHaveLength(BUILTIN_TEMPLATES.length);
    });
  });

  describe('TemplatesModule onModuleInit', () => {
    it('registers builtins on first init and stays idempotent on re-init', async () => {
      const ref = await Test.createTestingModule({ imports: [TemplatesModule] }).compile();
      await ref.init();
      const registry = ref.get(TemplateRegistry);

      expect(registry.get('recon-passive')).toBe(ReconPassive);
      expect(registry.get('recon-active')).toBe(ReconActive);
      expect(registry.get('recon-passive-deep')).toBe(ReconPassiveDeep);
      expect(registry.get('web-quick')).toBe(WebQuick);
      expect(registry.get('web-deep')).toBe(WebDeep);
      expect(registry.get('web-content')).toBe(WebContent);
      expect(registry.get('osint-passive')).toBe(OsintPassive);
      expect(registry.get('web-fingerprint')).toBe(WebFingerprint);
      expect(registry.get('osint-passive-deep')).toBe(OsintPassiveDeep);
      expect(registry.get('web-enrich')).toBe(WebEnrich);
      expect(registry.get('service-recon')).toBe(ServiceRecon);
      expect(registry.get('vuln-active')).toBe(VulnActive);
      expect(registry.get('network-vuln')).toBe(NetworkVuln);
      expect(registry.get('active-directory-recon')).toBe(ActiveDirectoryRecon);
      expect(registry.get('k8s-recon')).toBe(K8sRecon);
      expect(registry.get('cloud-exposure')).toBe(CloudExposure);
      expect(registry.list()).toHaveLength(21);

      // Re-running onModuleInit (simulating hot-reload / double-init) must not throw.
      const moduleInstance = ref.get(TemplatesModule);
      expect(() => moduleInstance.onModuleInit()).not.toThrow();
      expect(registry.list()).toHaveLength(BUILTIN_TEMPLATES.length);

      await ref.close();
    });
  });
});
