import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { useLocation, useParams } from 'react-router-dom';
import { RUN_SCAN_MUTATION, SCAN_QUERY, SCANNER_CATALOG_QUERY } from '../../lib/graphql/queries';
import { useAuth } from '../../lib/auth-context';
import { rawOutputUrl } from '../../lib/api-rest';
import { LiveLogsPane } from './live-logs-pane';
import { AssetsTable } from './assets-table';
import { NewTemplateRunForm } from '../template-runs/new-template-run-form';
import { ScannerSelect } from './scanner-select';
import { ScannerOptionsForm } from './scanner-options-form';
import type { ScannerCatalogEntry } from './scanner-catalog';

interface RunScanResult {
  runScan: {
    id: string;
    status: string;
    jobs?: { id: string; scannerName: string; target: string; status: string }[];
  };
}

interface ScanQueryResult {
  scan: {
    id: string;
    status: string;
    completedAt?: string | null;
    jobs?: {
      id: string;
      scannerName: string;
      target: string;
      status: string;
      rawOutputKey?: string | null;
    }[];
  };
}

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export function ScanRunPage() {
  const { engagementId } = useParams<{ engagementId: string }>();
  const location = useLocation();
  const preselectedScanner = (location.state as { scanner?: string } | null)?.scanner;
  const { session } = useAuth();
  const [scanner, setScanner] = useState(preselectedScanner ?? 'nmap');
  const [target, setTarget] = useState('127.0.0.1');
  const [optionsJson, setOptionsJson] = useState('');
  const [manualJson, setManualJson] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const { data: catalogData } = useQuery<{ scannerCatalog: ScannerCatalogEntry[] }>(
    SCANNER_CATALOG_QUERY,
  );
  const catalog = catalogData?.scannerCatalog ?? [];
  const selectedEntry = catalog.find((e) => e.name === scanner);

  const [runScan, { loading: starting, error: runError }] =
    useMutation<RunScanResult>(RUN_SCAN_MUTATION);

  const {
    data: scanData,
    startPolling,
    stopPolling,
  } = useQuery<ScanQueryResult>(SCAN_QUERY, {
    skip: !activeScanId,
    variables: activeScanId ? { id: activeScanId } : undefined,
    fetchPolicy: 'network-only',
  });

  useEffect(() => {
    if (!activeScanId) return;
    startPolling(2000);
    return () => stopPolling();
  }, [activeScanId, startPolling, stopPolling]);

  useEffect(() => {
    if (scanData?.scan && TERMINAL.has(scanData.scan.status)) {
      stopPolling();
    }
  }, [scanData, stopPolling]);

  async function onRun(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOptionsError(null);
    if (optionsJson.trim()) {
      try {
        JSON.parse(optionsJson);
      } catch {
        setOptionsError('Options must be valid JSON.');
        return;
      }
    }
    if (!engagementId) return;
    const res = await runScan({
      variables: {
        input: {
          engagementId,
          scannerName: scanner,
          target,
          optionsJson: optionsJson || undefined,
        },
      },
    });
    const created = res.data?.runScan;
    if (created) {
      setActiveScanId(created.id);
      setActiveJobId(created.jobs?.[0]?.id ?? null);
    }
  }

  if (!engagementId) return <p className="p-8">Missing engagement id.</p>;

  const job = scanData?.scan.jobs?.[0];
  const rawHref = job?.rawOutputKey && session ? rawOutputUrl(session.apiUrl, job.id) : null;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Run a scan</h1>
        <code className="text-xs text-slate-400">engagement {engagementId}</code>
      </header>

      <section className="space-y-2" aria-label="run-template-section">
        <h2 className="text-sm font-semibold text-slate-300">Run a recon template</h2>
        <NewTemplateRunForm engagementId={engagementId} />
      </section>

      <form
        onSubmit={onRun}
        className="bg-slate-900 p-4 rounded grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
        aria-label="run-scan"
      >
        <div className="md:col-span-4">
          <span className="block text-xs text-slate-300 mb-1">Scanner</span>
          <ScannerSelect entries={catalog} value={scanner} onChange={setScanner} />
        </div>
        <label className="md:col-span-2">
          <span className="block text-xs text-slate-300">Target</span>
          <input
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
          />
        </label>

        <div className="md:col-span-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-300">Options</span>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={manualJson}
                onChange={(e) => setManualJson(e.target.checked)}
              />
              Éditer le JSON manuellement
            </label>
          </div>

          {manualJson ? (
            <input
              className="w-full bg-slate-800 rounded px-2 py-1 font-mono"
              aria-label="options-json"
              value={optionsJson}
              onChange={(e) => setOptionsJson(e.target.value)}
              placeholder='{"ports":"1-1024"}'
            />
          ) : (
            <>
              <ScannerOptionsForm entry={selectedEntry} onChange={setOptionsJson} />
              {optionsJson ? (
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer">Aperçu JSON</summary>
                  <code className="block mt-1 break-all">{optionsJson}</code>
                </details>
              ) : null}
            </>
          )}
        </div>
        <button
          type="submit"
          disabled={starting}
          className="md:col-span-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded py-2"
        >
          {starting ? 'Queuing…' : 'Run scan'}
        </button>
        {optionsError ? (
          <p className="md:col-span-4 text-sm text-red-400" role="alert">
            {optionsError}
          </p>
        ) : null}
        {runError ? (
          <p className="md:col-span-4 text-sm text-red-400" role="alert">
            {runError.message}
          </p>
        ) : null}
      </form>

      {activeScanId ? (
        <section className="space-y-2" aria-label="scan-status">
          <h2 className="text-lg font-semibold">Scan {activeScanId}</h2>
          <p className="text-sm text-slate-400">
            status: <strong>{scanData?.scan.status ?? 'QUEUED'}</strong>
            {rawHref ? (
              <>
                {' · '}
                <a className="text-indigo-400 hover:underline" href={rawHref}>
                  download raw output
                </a>
              </>
            ) : null}
          </p>
          <LiveLogsPane scanJobId={activeJobId} />
        </section>
      ) : null}

      <section>
        <AssetsTable engagementId={engagementId} />
      </section>
    </div>
  );
}
