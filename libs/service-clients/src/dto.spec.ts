import type { ParseBatchRequest, ParseBatchResponse } from './dto';

describe('parse-batch contract', () => {
  it('carries engagement + scanJob scope and entity groups', () => {
    const req: ParseBatchRequest = {
      engagementId: 'eng_1',
      scanJobId: 'job_1',
      scannerName: 'nmap',
      assets: [{ type: 'IP', value: '127.0.0.1' }],
      ports: [],
      services: [],
      technologies: [],
    };
    expect(req.assets[0].value).toBe('127.0.0.1');
  });

  it('returns assets keyed by canonical value', () => {
    const res: ParseBatchResponse = {
      assetIdsByCanonicalValue: { '127.0.0.1': 'asset_1' },
      assetsPersisted: 1,
      portsPersisted: 0,
      servicesPersisted: 0,
      technologiesPersisted: 0,
      observationsPersisted: 1,
    };
    expect(res.assetIdsByCanonicalValue['127.0.0.1']).toBe('asset_1');
  });
});
