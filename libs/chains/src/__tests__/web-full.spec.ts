import { WebFullChain } from '../builtins/web-full';
import { validateChain } from '../schema';

describe('web-full chain', () => {
  it('is a valid chain definition', () => {
    expect(() => validateChain(WebFullChain)).not.toThrow();
  });

  it('gates web steps on httpDetected and branches wpscan on wordpress', () => {
    const byId = Object.fromEntries(WebFullChain.steps.map((s) => [s.id, s]));
    expect(byId['webanalyze'].when).toEqual([{ pred: 'httpDetected' }]);
    expect(byId['nuclei'].when).toEqual([{ pred: 'httpDetected' }]);
    expect(byId['wpscan'].when).toEqual([{ pred: 'techPresent', name: 'wordpress' }]);
  });

  it('filters live subdomains/urls on 2xx-3xx', () => {
    const byId = Object.fromEntries(WebFullChain.steps.map((s) => [s.id, s]));
    expect(byId['webanalyze'].target.filter).toEqual([
      { pred: 'statusIn', codes: [200, 301, 302] },
    ]);
  });
});
