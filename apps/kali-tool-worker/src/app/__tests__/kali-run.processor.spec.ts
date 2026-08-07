import { KaliRunProcessor } from '../kali-run.processor';

function makeDeps() {
  const run = {
    id: 'r1',
    engagementId: 'e1',
    binary: 'nmap',
    argsJson: ['-sV', 'scanme.example.com'],
    status: 'PENDING',
  };
  const prisma = {
    kaliToolRun: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(run),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const docker = {
    pullIfMissing: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockImplementation(async (spec: any) => {
      spec.onStdout?.('{"host":"up"}');
      return { exitCode: 0, durationMs: 5, containerId: 'c', timedOut: false, killedByUser: false };
    }),
  };
  const storage = {
    ensureBucket: jest.fn().mockResolvedValue(undefined),
    putObject: jest.fn().mockResolvedValue({}),
  };
  const bus = { publish: jest.fn().mockResolvedValue(undefined) };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  const registrar = { register: jest.fn().mockResolvedValue(undefined) };
  return { prisma, docker, storage, bus, events, registrar, run };
}

describe('KaliRunProcessor', () => {
  it('runs argv in kali-toolbox, stores output, publishes parse', async () => {
    const d = makeDeps();
    const p = new KaliRunProcessor(
      d.prisma as any,
      d.docker as any,
      d.storage as any,
      d.bus as any,
      d.registrar as any,
      d.events as any,
    );
    await p.process({ payload: { runId: 'r1' } } as any);

    // argv passed verbatim (no shell), correct image
    expect(d.docker.run).toHaveBeenCalledWith(
      expect.objectContaining({
        image: 'autoscanner/kali-toolbox:1.0',
        cmd: ['nmap', '-sV', 'scanme.example.com'],
      }),
    );
    // stored to raw-outputs
    expect(d.storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'raw-outputs', key: 'kali/e1/r1.out' }),
    );
    // published parse with the key
    expect(d.bus.publish).toHaveBeenCalledWith(
      'security.kalitool.parse.requested',
      'r1',
      expect.objectContaining({ runId: 'r1', rawOutputKey: 'kali/e1/r1.out' }),
    );
    // status ended RUNNING (parse consumer flips to COMPLETED)
    expect(d.prisma.kaliToolRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: expect.objectContaining({ status: 'RUNNING' }),
      }),
    );
  });

  it('is a no-op for an already-terminal run (redelivery)', async () => {
    const d = makeDeps();
    d.prisma.kaliToolRun.findUniqueOrThrow.mockResolvedValue({ ...d.run, status: 'COMPLETED' });
    const p = new KaliRunProcessor(
      d.prisma as any,
      d.docker as any,
      d.storage as any,
      d.bus as any,
      d.registrar as any,
      d.events as any,
    );
    await p.process({ payload: { runId: 'r1' } } as any);
    expect(d.docker.run).not.toHaveBeenCalled();
  });
});
