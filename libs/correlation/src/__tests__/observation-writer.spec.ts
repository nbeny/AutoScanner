import { writeObservation } from '../observation-writer';

describe('writeObservation', () => {
  it('forwards required fields to assetObservation.create on the given tx', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'obs1' });
    const tx = { assetObservation: { create } } as never;
    await writeObservation(tx, {
      assetId: 'a1',
      scanJobId: 'j1',
      scannerName: 'nuclei',
      kind: 'FINDING_RAISED',
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        assetId: 'a1',
        scanJobId: 'j1',
        scannerName: 'nuclei',
        kind: 'FINDING_RAISED',
        payload: undefined,
      },
      select: { id: true },
    });
  });

  it('forwards payload when provided', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'obs2' });
    const tx = { assetObservation: { create } } as never;
    await writeObservation(tx, {
      assetId: 'a1',
      scanJobId: 'j1',
      scannerName: 'nmap',
      kind: 'PORT_OPEN',
      payload: { number: 443, protocol: 'TCP' },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        assetId: 'a1',
        scanJobId: 'j1',
        scannerName: 'nmap',
        kind: 'PORT_OPEN',
        payload: { number: 443, protocol: 'TCP' },
      },
      select: { id: true },
    });
  });
});
