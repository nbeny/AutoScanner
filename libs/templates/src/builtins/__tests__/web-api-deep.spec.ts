import { WebApiDeep } from '../web-api-deep';
import { BUILTIN_TEMPLATES } from '../index';

describe('WebApiDeep template', () => {
  it('appears in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toContain('web-api-deep');
  });

  it('chains 10 steps in expected order', () => {
    expect(WebApiDeep.steps.map((s) => s.scannerName)).toEqual([
      'httpx',
      'subjs',
      'linkfinder',
      'jsluice',
      'kiterunner',
      'graphw00f',
      'graphql-cop',
      'mantra',
      'oauth-oidc',
      'saml-recon',
    ]);
  });

  it('mantra consumes discovered endpoints for secret-hunting', () => {
    const mantra = WebApiDeep.steps.find((s) => s.scannerName === 'mantra');
    expect(mantra?.target).toEqual({ kind: 'context', path: 'endpoints' });
    expect(mantra?.inputs).toEqual({});
  });

  it('oauth-oidc and saml-recon target the engagement root', () => {
    const oauth = WebApiDeep.steps.find((s) => s.scannerName === 'oauth-oidc');
    const saml = WebApiDeep.steps.find((s) => s.scannerName === 'saml-recon');
    expect(oauth?.target).toEqual({ kind: 'context', path: 'target' });
    expect(oauth?.inputs).toEqual({});
    expect(saml?.target).toEqual({ kind: 'context', path: 'target' });
    expect(saml?.inputs).toEqual({});
  });

  it('linkfinder and jsluice consume JS endpoint URLs (path: endpoints)', () => {
    const linkfinder = WebApiDeep.steps.find((s) => s.scannerName === 'linkfinder');
    const jsluice = WebApiDeep.steps.find((s) => s.scannerName === 'jsluice');
    expect(linkfinder?.target).toEqual({ kind: 'context', path: 'endpoints' });
    expect(jsluice?.target).toEqual({ kind: 'context', path: 'endpoints' });
  });

  it('kiterunner targets the engagement root for host-level brute', () => {
    const kr = WebApiDeep.steps.find((s) => s.scannerName === 'kiterunner');
    expect(kr?.target).toEqual({ kind: 'context', path: 'target' });
  });

  it('graphw00f targets the engagement root for discovery', () => {
    const g = WebApiDeep.steps.find((s) => s.scannerName === 'graphw00f');
    expect(g?.target).toEqual({ kind: 'context', path: 'target' });
  });

  it('graphql-cop consumes the endpoints context (gets graphw00f-discovered URL)', () => {
    const cop = WebApiDeep.steps.find((s) => s.scannerName === 'graphql-cop');
    expect(cop?.target).toEqual({ kind: 'context', path: 'endpoints' });
  });

  it('httpx probes subdomains as the first step (Phase 13 convention)', () => {
    expect(WebApiDeep.steps[0]).toEqual({
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    });
  });

  it('subjs targets the engagement root for JS file discovery', () => {
    const subjs = WebApiDeep.steps.find((s) => s.scannerName === 'subjs');
    expect(subjs?.target).toEqual({ kind: 'context', path: 'target' });
  });

  it('exposes a scope-acknowledgement banner about kiterunner rate-limiting', () => {
    expect(WebApiDeep.scopeAcknowledgement).toMatch(/kiterunner|rate-limit/i);
  });
});
