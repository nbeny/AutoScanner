import { runScanRun } from '../commands/scan';

describe('runScanRun', () => {
  it('forwards inputs to api.runScan and prints scan + job ids', async () => {
    const runScan = jest.fn().mockResolvedValue({
      id: 'scan_1',
      status: 'QUEUED',
      engagementId: 'eng_1',
      createdAt: 'now',
      jobs: [{ id: 'job_1', status: 'QUEUED', scannerName: 'nmap', target: '1.2.3.4' }],
    });
    const logs: string[] = [];

    const scan = await runScanRun(
      { client: { runScan }, log: (m) => logs.push(m) },
      {
        engagementId: 'eng_1',
        scannerName: 'nmap',
        target: '1.2.3.4',
        optionsJson: '{"ports":"1-100"}',
      },
    );

    expect(runScan).toHaveBeenCalledWith({
      engagementId: 'eng_1',
      scannerName: 'nmap',
      target: '1.2.3.4',
      optionsJson: '{"ports":"1-100"}',
      name: undefined,
    });
    expect(scan.id).toBe('scan_1');
    expect(logs).toEqual(['scan scan_1 queued (scanJob job_1)']);
  });

  it('rejects malformed --options JSON locally before calling the api', async () => {
    const runScan = jest.fn();

    await expect(
      runScanRun(
        { client: { runScan }, log: () => undefined },
        { engagementId: 'e', scannerName: 'nmap', target: 't', optionsJson: '{bad' },
      ),
    ).rejects.toThrow('--options must be valid JSON');

    expect(runScan).not.toHaveBeenCalled();
  });
});
