import { FofaJsonParser } from '../fofa-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'fofa',
  target: 'example.com',
  engagementId: 'e',
};

const SAMPLE = JSON.stringify([
  { host: 'api.example.com', ip: '1.2.3.4', port: 443, server: 'nginx/1.25', banner: '' },
  { host: '5.6.7.8', ip: '5.6.7.8', port: 80, server: 'Apache/2.4.41', banner: '' },
  { host: '', ip: '', port: 0, server: '' },
]);

describe('FofaJsonParser', () => {
  it('emits IP assets and Technology rows from banner/server fields', async () => {
    const out = await new FofaJsonParser().parse(SAMPLE, ctx);
    const ips = out.assets.map((a) => a.value).sort();
    expect(ips).toEqual(['1.2.3.4', '5.6.7.8']);
    expect(out.assets.find((a) => a.value === '1.2.3.4')?.hostnames).toEqual(['api.example.com']);
    expect(out.technologies.map((t) => t.name).sort()).toEqual(['Apache', 'nginx']);
    expect(out.technologies.find((t) => t.name === 'nginx')?.version).toBe('1.25');
  });

  it('returns empty output on blank or non-array input', async () => {
    expect((await new FofaJsonParser().parse('', ctx)).assets).toEqual([]);
    expect((await new FofaJsonParser().parse('{"oops":1}', ctx)).assets).toEqual([]);
  });
});
