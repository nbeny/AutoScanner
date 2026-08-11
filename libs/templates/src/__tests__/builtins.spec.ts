import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Test } from '@nestjs/testing';

import {
  BUILTIN_TEMPLATES,
  ReconDomaine,
  ReconPassif,
  Reseau,
  SmbWindows,
  Snmp,
  TemplateRegistry,
  TemplatesModule,
  Tls,
  WebContenu,
  WebSurface,
} from '../index';
import type { TemplateDefinition } from '../types';

/** Literal token the generic Kali scanner replaces with the run target. */
const TARGET_PLACEHOLDER = '{{target}}';

/** Resolve `data/kali-tools.json` from the repo root (cwd) or by walking up. */
function loadKaliBinaries(): Set<string> {
  const candidates: string[] = [join(process.cwd(), 'data', 'kali-tools.json')];
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    candidates.push(join(dir, 'data', 'kali-tools.json'));
    dir = dirname(dir);
  }
  for (const path of candidates) {
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { binary: string }[];
      return new Set(parsed.map((r) => r.binary));
    }
  }
  throw new Error('data/kali-tools.json not found from any candidate path');
}

describe('builtin templates (SP3a linear playlists)', () => {
  const binaries = loadKaliBinaries();

  it('exposes exactly the 8 curated playlists', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(8);
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toEqual([
      'recon-passif',
      'recon-domaine',
      'web-surface',
      'web-contenu',
      'tls',
      'reseau',
      'smb-windows',
      'snmp',
    ]);
  });

  it('has unique template names', () => {
    const names = BUILTIN_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every template is well-formed (name, displayName, description, non-empty steps)', () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      expect(typeof tpl.name).toBe('string');
      expect(tpl.name.length).toBeGreaterThan(0);
      expect(typeof tpl.displayName).toBe('string');
      expect(tpl.displayName.length).toBeGreaterThan(0);
      expect(typeof tpl.description).toBe('string');
      expect(tpl.description.length).toBeGreaterThan(0);
      expect(Array.isArray(tpl.steps)).toBe(true);
      expect(tpl.steps.length).toBeGreaterThan(0);
    }
  });

  it('every step names a binary present in data/kali-tools.json', () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      for (const step of tpl.steps) {
        expect(binaries.has(step.scannerName)).toBe(true);
      }
    }
  });

  it('every step has a linear-playlist shape (no legacy inputs/target/context keys)', () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      for (const step of tpl.steps) {
        // args, when present, must be a string.
        if (step.args !== undefined) expect(typeof step.args).toBe('string');
        if (step.preset !== undefined) expect(typeof step.preset).toBe('string');
        // Legacy structured keys must be gone.
        const raw = step as unknown as Record<string, unknown>;
        expect(raw['inputs']).toBeUndefined();
        expect(raw['target']).toBeUndefined();
      }
    }
  });

  it('uses the {{target}} placeholder only inside args strings', () => {
    // Sanity: any step whose tool needs the target mid-command must carry the
    // literal token in args (the generic build() auto-appends otherwise).
    const withPlaceholder = BUILTIN_TEMPLATES.flatMap((t) => t.steps).filter((s) =>
      s.args?.includes(TARGET_PLACEHOLDER),
    );
    for (const step of withPlaceholder) {
      expect(step.args).toContain(TARGET_PLACEHOLDER);
    }
  });

  it('gates the aggressive masscan sweep behind active-recon-host-net', () => {
    const masscan = Reseau.steps.find((s) => s.scannerName === 'masscan');
    expect(masscan?.requiresCapability).toBe('active-recon-host-net');
  });

  it('individual playlists expose their expected scanner sequence', () => {
    const seq = (t: TemplateDefinition): string[] => t.steps.map((s) => s.scannerName);
    expect(seq(ReconPassif)).toEqual(['dmitry', 'theharvester', 'dnsenum']);
    expect(seq(ReconDomaine)).toEqual(['amass', 'dnsrecon', 'fierce']);
    expect(seq(WebSurface)).toEqual(['whatweb', 'wafw00f', 'nikto']);
    expect(seq(WebContenu)).toEqual(['dirb', 'wpscan']);
    expect(seq(Tls)).toEqual(['sslscan', 'sslyze']);
    expect(seq(Reseau)).toEqual(['nmap', 'masscan']);
    expect(seq(SmbWindows)).toEqual(['enum4linux', 'smbmap']);
    expect(seq(Snmp)).toEqual(['onesixtyone', 'snmp-check']);
  });

  it('can be registered into a TemplateRegistry and retrieved by name', () => {
    const registry = new TemplateRegistry();
    for (const def of BUILTIN_TEMPLATES) registry.register(def);
    expect(registry.get('recon-passif')).toBe(ReconPassif);
    expect(registry.get('reseau')).toBe(Reseau);
    expect(registry.list()).toHaveLength(BUILTIN_TEMPLATES.length);
  });

  describe('TemplatesModule onModuleInit', () => {
    it('registers builtins on first init and stays idempotent on re-init', async () => {
      const ref = await Test.createTestingModule({ imports: [TemplatesModule] }).compile();
      await ref.init();
      const registry = ref.get(TemplateRegistry);

      expect(registry.get('recon-passif')).toBe(ReconPassif);
      expect(registry.get('web-surface')).toBe(WebSurface);
      expect(registry.list()).toHaveLength(BUILTIN_TEMPLATES.length);

      const moduleInstance = ref.get(TemplatesModule);
      expect(() => moduleInstance.onModuleInit()).not.toThrow();
      expect(registry.list()).toHaveLength(BUILTIN_TEMPLATES.length);

      await ref.close();
    });
  });
});
