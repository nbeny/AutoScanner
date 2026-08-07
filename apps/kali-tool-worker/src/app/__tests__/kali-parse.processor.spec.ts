import { KaliParseProcessor } from '../kali-parse.processor';

function deps(status = 'RUNNING') {
  const prisma = {
    kaliToolRun: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'r1', status }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const storage = {
    getObject: jest.fn().mockResolvedValue({ body: Buffer.from('{"host":"up"}', 'utf8') }),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  const registrar = { register: jest.fn().mockResolvedValue(undefined) };
  return { prisma, storage, events, registrar };
}

describe('KaliParseProcessor', () => {
  it('parses JSON output and persists COMPLETED', async () => {
    const d = deps();
    const p = new KaliParseProcessor(
      d.prisma as any,
      d.storage as any,
      d.registrar as any,
      d.events as any,
    );
    await p.process({ payload: { runId: 'r1', rawOutputKey: 'kali/e1/r1.out' } } as any);

    expect(d.storage.getObject).toHaveBeenCalledWith('raw-outputs', 'kali/e1/r1.out');
    expect(d.prisma.kaliToolRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          outputFormat: 'json',
          parsedJson: { format: 'json', view: { host: 'up' } },
        }),
      }),
    );
    expect(d.events.publish).toHaveBeenLastCalledWith('r1', {
      type: 'status',
      status: 'COMPLETED',
    });
  });

  it('is a no-op if already COMPLETED (redelivery)', async () => {
    const d = deps('COMPLETED');
    const p = new KaliParseProcessor(
      d.prisma as any,
      d.storage as any,
      d.registrar as any,
      d.events as any,
    );
    await p.process({ payload: { runId: 'r1', rawOutputKey: 'k' } } as any);
    expect(d.storage.getObject).not.toHaveBeenCalled();
  });
});
