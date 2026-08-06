import { ValidationPipe } from '@nestjs/common';

import { ScansFilterInput } from '../dto/scans-filter.input';

// The global pipe (app.module.ts) runs with whitelist + forbidNonWhitelisted.
// class-validator builds its whitelist from ITS OWN decorators, so a DTO that
// only carries @Field() decorators has an empty whitelist and rejects every
// property the caller sends. This reproduces the cockpit/scans-page request.
describe('ScansFilterInput — global ValidationPipe compatibility', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = { type: 'body', metatype: ScansFilterInput } as any;

  it('accepts the statusIn filter sent by the cockpit / scans page', async () => {
    const out = await pipe.transform({ statusIn: ['RUNNING', 'QUEUED'] }, meta);
    expect(out.statusIn).toEqual(['RUNNING', 'QUEUED']);
  });

  it('accepts the remaining filter fields', async () => {
    const out = await pipe.transform(
      { status: 'FAILED', engagementId: 'e1', scannerName: 'nmap', limit: 10, offset: 0 },
      meta,
    );
    expect(out).toMatchObject({
      status: 'FAILED',
      engagementId: 'e1',
      scannerName: 'nmap',
      limit: 10,
      offset: 0,
    });
  });

  it('still rejects genuinely unknown properties', async () => {
    await expect(pipe.transform({ bogus: 1 } as any, meta)).rejects.toBeDefined();
  });
});
