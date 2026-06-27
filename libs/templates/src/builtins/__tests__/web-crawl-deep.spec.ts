import { WebCrawlDeep } from '../web-crawl-deep';
import { BUILTIN_TEMPLATES } from '../index';

describe('WebCrawlDeep template', () => {
  it('appears in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toContain('web-crawl-deep');
  });

  it('chains 8 steps in expected order', () => {
    expect(WebCrawlDeep.steps.map((s) => s.scannerName)).toEqual([
      'httpx',
      'katana',
      'gospider',
      'hakrawler',
      'feroxbuster',
      'kiterunner',
      'cariddi',
      'corsy',
    ]);
  });

  it('crawler steps (katana, gospider, hakrawler, feroxbuster) all target the engagement root', () => {
    const crawlerNames = ['katana', 'gospider', 'hakrawler', 'feroxbuster'];
    for (const name of crawlerNames) {
      const step = WebCrawlDeep.steps.find((s) => s.scannerName === name);
      expect(step?.target).toEqual({ kind: 'context', path: 'target' });
    }
  });

  it('cariddi and corsy consume the fanned-in endpoints context', () => {
    const cariddi = WebCrawlDeep.steps.find((s) => s.scannerName === 'cariddi');
    const corsy = WebCrawlDeep.steps.find((s) => s.scannerName === 'corsy');
    expect(cariddi?.target).toEqual({ kind: 'context', path: 'endpoints' });
    expect(corsy?.target).toEqual({ kind: 'context', path: 'endpoints' });
  });

  it('httpx is the first probe step on subdomains', () => {
    expect(WebCrawlDeep.steps[0]).toEqual({
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    });
  });
});

describe('WebCrawlDeep template (Phase 14A enrichment)', () => {
  it('preserves all phase-13C steps (httpx, katana, gospider, hakrawler, feroxbuster, cariddi, corsy)', () => {
    const names = WebCrawlDeep.steps.map((s) => s.scannerName);
    for (const expected of [
      'httpx',
      'katana',
      'gospider',
      'hakrawler',
      'feroxbuster',
      'cariddi',
      'corsy',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('inserts kiterunner between feroxbuster and cariddi', () => {
    const names = WebCrawlDeep.steps.map((s) => s.scannerName);
    const idxFerox = names.indexOf('feroxbuster');
    const idxKr = names.indexOf('kiterunner');
    const idxCariddi = names.indexOf('cariddi');
    expect(idxKr).toBe(idxFerox + 1);
    expect(idxCariddi).toBe(idxKr + 1);
  });

  it('kiterunner targets the engagement root (host-level brute, not crawled endpoints)', () => {
    const kr = WebCrawlDeep.steps.find((s) => s.scannerName === 'kiterunner');
    expect(kr?.target).toEqual({ kind: 'context', path: 'target' });
  });
});
