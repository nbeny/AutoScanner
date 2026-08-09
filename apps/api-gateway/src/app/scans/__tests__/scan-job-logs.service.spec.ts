import { Readable } from 'node:stream';
import { ScansService } from '../scans.service';

function streamOf(text: string): Readable {
  return Readable.from([Buffer.from(text, 'utf8')]);
}

describe('ScansService.getScanJobLogs', () => {
  it('renvoie le texte du blob MinIO', async () => {
    const storage = { getObject: jest.fn().mockResolvedValue({ body: streamOf('hello logs') }) };
    const svc = Object.create(ScansService.prototype) as ScansService;
    (svc as unknown as { storage: unknown }).storage = storage;
    await expect(svc.getScanJobLogs('job-1')).resolves.toBe('hello logs');
    expect(storage.getObject).toHaveBeenCalledWith('logs', 'job-1.log');
  });

  it('renvoie une chaîne vide quand le blob n’existe pas', async () => {
    const storage = { getObject: jest.fn().mockRejectedValue(new Error('NoSuchKey')) };
    const svc = Object.create(ScansService.prototype) as ScansService;
    (svc as unknown as { storage: unknown }).storage = storage;
    await expect(svc.getScanJobLogs('job-x')).resolves.toBe('');
  });
});
