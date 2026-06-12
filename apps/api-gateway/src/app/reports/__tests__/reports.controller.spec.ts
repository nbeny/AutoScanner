import { HttpException } from '@nestjs/common';
import { PassThrough, Readable } from 'node:stream';
import { ConflictError, NotFoundError } from '@autoscanner/common';

import { ReportsController } from '../reports.controller';
import type { ReportsService } from '../reports.service';

const USER = { id: 'user_1' } as never;

function makeMockResponse() {
  const sink = new PassThrough();
  const collected: Buffer[] = [];
  sink.on('data', (c: Buffer) => collected.push(c));
  return Object.assign(sink, {
    setHeader: jest.fn(),
    headers: new Map<string, string>(),
    collected,
  });
}

describe('ReportsController.download', () => {
  let svc: jest.Mocked<Pick<ReportsService, 'streamDownload'>>;
  let controller: ReportsController;

  beforeEach(() => {
    svc = { streamDownload: jest.fn() } as unknown as jest.Mocked<
      Pick<ReportsService, 'streamDownload'>
    >;
    controller = new ReportsController(svc as unknown as ReportsService);
  });

  it('streams content with download headers when READY', async () => {
    const body = Readable.from([Buffer.from('hello')]);
    svc.streamDownload.mockResolvedValue({
      stream: body,
      contentType: 'application/json',
      sizeBytes: 5,
      filename: 'report-rep_1.json',
    });
    const res = makeMockResponse();

    await controller.download(USER, 'rep_1', res as never);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '5');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="report-rep_1.json"',
    );
    expect(Buffer.concat(res.collected).toString()).toBe('hello');
  });

  it('maps ConflictError to HttpException 409', async () => {
    svc.streamDownload.mockRejectedValue(new ConflictError('Report rep_1 is not READY'));
    const res = makeMockResponse();
    await expect(controller.download(USER, 'rep_1', res as never)).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('maps NotFoundError to HttpException 404', async () => {
    svc.streamDownload.mockRejectedValue(new NotFoundError('Report', 'rep_x'));
    const res = makeMockResponse();
    await expect(controller.download(USER, 'rep_x', res as never)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('returns 409 status code on ConflictError', async () => {
    svc.streamDownload.mockRejectedValue(new ConflictError('not ready'));
    const res = makeMockResponse();
    await expect(controller.download(USER, 'rep_1', res as never)).rejects.toMatchObject({
      status: 409,
    });
  });
});
