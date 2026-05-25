import type { ApiClient, ScanSummary } from '../lib/api-client';

export interface ScanRunDeps {
  client: Pick<ApiClient, 'runScan'>;
  log: (msg: string) => void;
}

export interface ScanRunOptions {
  engagementId: string;
  scannerName: string;
  target: string;
  optionsJson?: string;
  name?: string;
}

export async function runScanRun(deps: ScanRunDeps, opts: ScanRunOptions): Promise<ScanSummary> {
  if (opts.optionsJson) {
    try {
      JSON.parse(opts.optionsJson);
    } catch {
      throw new Error('--options must be valid JSON');
    }
  }
  const scan = await deps.client.runScan({
    engagementId: opts.engagementId,
    scannerName: opts.scannerName,
    target: opts.target,
    optionsJson: opts.optionsJson,
    name: opts.name,
  });
  const job = scan.jobs?.[0];
  deps.log(`scan ${scan.id} queued${job ? ` (scanJob ${job.id})` : ''}`);
  return scan;
}
