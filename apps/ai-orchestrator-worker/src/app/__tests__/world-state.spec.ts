import { Readable } from 'node:stream';

import { WorldStateService, RAW_EXCERPT_BYTES } from '../world-state.service';

describe('WorldStateService', () => {
  function makePrisma(jobs: unknown[]) {
    return {
      scanJob: {
        findMany: jest.fn().mockResolvedValue(jobs),
      },
    } as any;
  }

  function makeStorage(bodies: Record<string, string | Error>) {
    return {
      getObject: jest.fn().mockImplementation((_bucket: string, key: string) => {
        const value = bodies[key];
        if (value instanceof Error) return Promise.reject(value);
        if (value === undefined) return Promise.reject(new Error('not found'));
        return Promise.resolve({ body: Readable.from([Buffer.from(value, 'utf8')]) });
      }),
    } as any;
  }

  it('builds scannersRun + truncated recentOutputs from completed jobs', async () => {
    const prisma = makePrisma([
      { scannerName: 'nmap', target: '10.0.0.1', status: 'COMPLETED', rawOutputKey: 'k/nmap' },
      { scannerName: 'nmap', target: '10.0.0.1', status: 'RUNNING', rawOutputKey: null },
      {
        scannerName: 'whatweb',
        target: '10.0.0.1',
        status: 'COMPLETED',
        rawOutputKey: 'k/whatweb',
      },
    ]);
    const storage = makeStorage({
      'k/nmap': '22/tcp open ssh OpenSSH 8.9\n80/tcp open http nginx',
      'k/whatweb': 'nginx[1.25], WordPress[6.5]',
    });
    const svc = new WorldStateService(prisma, storage);

    const ws = await svc.build('run-1', 'eng-1', 'example.com');

    expect(ws.target).toBe('example.com');
    expect(ws.scannersRun).toEqual(['nmap', 'whatweb']);
    expect(ws.recentOutputs).toEqual([
      {
        scanner: 'nmap',
        target: '10.0.0.1',
        excerpt: '22/tcp open ssh OpenSSH 8.9\n80/tcp open http nginx',
      },
      { scanner: 'whatweb', target: '10.0.0.1', excerpt: 'nginx[1.25], WordPress[6.5]' },
    ]);
    // Only COMPLETED jobs with a rawOutputKey were fetched.
    expect(storage.getObject).toHaveBeenCalledTimes(2);
    expect(storage.getObject).toHaveBeenCalledWith('raw-outputs', 'k/nmap');
  });

  it('truncates each excerpt to the byte cap', async () => {
    const big = 'A'.repeat(RAW_EXCERPT_BYTES * 3);
    const prisma = makePrisma([
      { scannerName: 'gobuster', target: 't', status: 'COMPLETED', rawOutputKey: 'k/big' },
    ]);
    const storage = makeStorage({ 'k/big': big });
    const svc = new WorldStateService(prisma, storage);

    const ws = await svc.build('run-1', 'eng-1', 'example.com');

    expect(ws.recentOutputs).toHaveLength(1);
    expect(Buffer.byteLength(ws.recentOutputs[0].excerpt, 'utf8')).toBeLessThanOrEqual(
      RAW_EXCERPT_BYTES,
    );
  });

  it('skips (does not throw) when a download fails', async () => {
    const prisma = makePrisma([
      { scannerName: 'nmap', target: 't', status: 'COMPLETED', rawOutputKey: 'k/ok' },
      { scannerName: 'nikto', target: 't', status: 'COMPLETED', rawOutputKey: 'k/boom' },
    ]);
    const storage = makeStorage({ 'k/ok': 'ok output', 'k/boom': new Error('minio down') });
    const svc = new WorldStateService(prisma, storage);

    const ws = await svc.build('run-1', 'eng-1', 'example.com');

    // Failed download skipped; successful one kept. Both scanners still counted.
    expect(ws.scannersRun).toEqual(['nmap', 'nikto']);
    expect(ws.recentOutputs).toEqual([{ scanner: 'nmap', target: 't', excerpt: 'ok output' }]);
  });

  it('returns empty recentOutputs when nothing has completed', async () => {
    const prisma = makePrisma([
      { scannerName: 'nmap', target: 't', status: 'RUNNING', rawOutputKey: null },
    ]);
    const storage = makeStorage({});
    const svc = new WorldStateService(prisma, storage);

    const ws = await svc.build('run-1', 'eng-1', 'example.com');

    expect(ws.scannersRun).toEqual(['nmap']);
    expect(ws.recentOutputs).toEqual([]);
    expect(storage.getObject).not.toHaveBeenCalled();
  });
});
