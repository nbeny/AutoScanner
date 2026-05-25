import { HttpException } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';

import type { ScansService } from '../scans.service';
import { ScansController } from '../scans.controller';

describe('ScansController', () => {
  let svc: jest.Mocked<Pick<ScansService, 'getRawOutputPresignedUrl'>>;
  let controller: ScansController;
  const user = { id: 'user_1' } as never;

  beforeEach(() => {
    svc = { getRawOutputPresignedUrl: jest.fn() } as unknown as jest.Mocked<
      Pick<ScansService, 'getRawOutputPresignedUrl'>
    >;
    controller = new ScansController(svc as unknown as ScansService);
  });

  describe('getRaw', () => {
    it('returns a 302 redirect to the presigned URL', async () => {
      svc.getRawOutputPresignedUrl.mockResolvedValue({
        url: 'https://minio.local/raw-outputs/eng/scan/job/nmap-xml.xml?sig=abc',
        key: 'eng/scan/job/nmap-xml.xml',
        expiresInSeconds: 3600,
      });

      const result = await controller.getRaw(user, 'job_1');

      expect(svc.getRawOutputPresignedUrl).toHaveBeenCalledWith('user_1', 'job_1');
      expect(result).toEqual({
        url: 'https://minio.local/raw-outputs/eng/scan/job/nmap-xml.xml?sig=abc',
        statusCode: 302,
      });
    });

    it('maps NotFoundError to 404 HttpException', async () => {
      svc.getRawOutputPresignedUrl.mockRejectedValue(new NotFoundError('ScanJob', 'job_x'));

      await expect(controller.getRaw(user, 'job_x')).rejects.toBeInstanceOf(HttpException);
      await expect(controller.getRaw(user, 'job_x')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('lets unknown errors bubble unchanged', async () => {
      svc.getRawOutputPresignedUrl.mockRejectedValue(new Error('boom'));

      await expect(controller.getRaw(user, 'job_1')).rejects.toThrow('boom');
    });
  });
});
