import { WebCrawlDeep } from '../web-crawl-deep';
import { BUILTIN_TEMPLATES } from '../index';

describe('WebCrawlDeep template', () => {
  it('appears in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toContain('web-crawl-deep');
  });

  it('chains 7 steps in expected order', () => {
    expect(WebCrawlDeep.steps.map((s) => s.scannerName)).toEqual([
      'httpx',
      'katana',
      'gospider',
      'hakrawler',
      'feroxbuster',
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
