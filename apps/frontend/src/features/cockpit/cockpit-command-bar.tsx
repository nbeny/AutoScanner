import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { HealthPill, type HealthPillData } from './health-pill';
import type { CockpitFocus } from './scanner-focus-panel';
import { ScannerOptionsForm } from '../scans/scanner-options-form';
import { KaliToolLauncher } from './kali-tool-launcher';
import {
  RUN_SCAN_MUTATION,
  RUN_TEMPLATE_MUTATION,
  CANCEL_ALL_SCANS_MUTATION,
  SCANNER_CATALOG_QUERY,
  SCAN_TEMPLATES_QUERY,
} from '../../lib/graphql/queries';
import {
  acceptsTarget,
  detectTargetType,
  groupForCategories,
  isOsintEntry,
  type Category,
  type ScannerCatalogEntry,
} from '../scans/scanner-catalog';

/** Category display order in the scanner selector (mirrors tools-grid). */
const CATEGORY_ORDER: Category[] = [
  'DNS/Subdomains',
  'Ports/Network',
  'Web/HTTP',
  'TLS',
  'Cloud',
  'Active Directory',
  'Vuln/Exploit',
  'Other',
];

interface ScanTemplateSummary {
  id: string;
  name: string;
  displayName: string;
  description: string;
}

/** Human label for the detected target type (null = ambiguous). */
const TARGET_TYPE_LABEL: Record<string, string> = {
  domain: 'domaine',
  ip: 'IP',
  cidr: 'CIDR',
  url: 'URL',
  email: 'email',
  username: 'username',
  phone: 'téléphone',
  bucket: 'bucket',
  repo: 'repo',
  asn: 'ASN',
};

export interface CockpitCommandBarProps {
  engagementId?: string;
  pills: HealthPillData[];
  /** Fired with the freshly-created job so the caller can focus it and start
   *  streaming its live logs immediately (the run is over in seconds — waiting
   *  for the operator to click it in the list misses the whole stream). */
  onLaunched?: (focus: CockpitFocus) => void;
}

type LaunchMode = 'scanner' | 'template' | 'kali';

export function CockpitCommandBar({ engagementId, pills, onLaunched }: CockpitCommandBarProps) {
  const [mode, setMode] = useState<LaunchMode>('scanner');
  const [target, setTarget] = useState('');
  const [scanner, setScanner] = useState('nmap');
  const [template, setTemplate] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [armed, setArmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [optionsJson, setOptionsJson] = useState('');
  const [showOptions, setShowOptions] = useState(false);

  const { data: catalogData } = useQuery<{ scannerCatalog: ScannerCatalogEntry[] }>(
    SCANNER_CATALOG_QUERY,
  );
  const { data: templatesData } = useQuery<{ scanTemplates: ScanTemplateSummary[] }>(
    SCAN_TEMPLATES_QUERY,
  );

  const [runScan, { loading: launchingScan, error: scanError }] = useMutation(RUN_SCAN_MUTATION);
  const [runTemplate, { loading: launchingTemplate, error: templateError }] =
    useMutation(RUN_TEMPLATE_MUTATION);
  const [cancelAll, { loading: killing }] = useMutation(CANCEL_ALL_SCANS_MUTATION);

  const scoped = Boolean(engagementId);
  const detected = detectTargetType(target);
  const catalog = useMemo(() => catalogData?.scannerCatalog ?? [], [catalogData]);
  const selectedEntry = useMemo(() => catalog.find((e) => e.name === scanner), [catalog, scanner]);
  const templates = templatesData?.scanTemplates ?? [];

  // Scanners relevant to the typed target, grouped by category. When "showAll"
  // is on (or the target is ambiguous) every scanner is offered.
  const groupedScanners = useMemo(() => {
    const groups = new Map<Category, ScannerCatalogEntry[]>();
    for (const entry of catalog) {
      if (isOsintEntry(entry)) continue; // le launcher Recon ne propose jamais d'OSINT
      if (!showAll && !acceptsTarget(entry.name, detected)) continue;
      const cat = groupForCategories(entry.categories);
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(entry);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b))
      .map(
        ([cat, entries]) => [cat, entries.sort((a, b) => a.name.localeCompare(b.name))] as const,
      );
  }, [catalog, showAll, detected]);

  const visibleScannerNames = useMemo(
    () => new Set(groupedScanners.flatMap(([, entries]) => entries.map((e) => e.name))),
    [groupedScanners],
  );

  // Keep the selected scanner valid: if the filter hid it, fall back to the
  // first available scanner in the (ordered) filtered list.
  useEffect(() => {
    if (visibleScannerNames.size === 0) return;
    if (!visibleScannerNames.has(scanner)) {
      const first = groupedScanners[0]?.[1][0]?.name;
      if (first) setScanner(first);
    }
  }, [visibleScannerNames, groupedScanners, scanner]);

  // Default the template selector to the first template once loaded.
  useEffect(() => {
    if (!template && templates.length > 0) setTemplate(templates[0].name);
  }, [templates, template]);

  async function launch() {
    if (!engagementId || !target) return;
    setNotice(null);

    if (mode === 'template') {
      if (!template) return;
      const res = await runTemplate({
        variables: { input: { engagementId, templateName: template, target } },
      });
      const run = res.data?.runTemplate as { id: string; templateName: string } | undefined;
      if (run) {
        setNotice(`Chaîne « ${run.templateName} » lancée.`);
        setTarget('');
      }
      return;
    }

    const res = await runScan({
      variables: { input: { engagementId, scannerName: scanner, target, optionsJson } },
    });
    const scan = res.data?.runScan as
      | { id: string; jobs?: Array<{ id: string; scannerName: string; target: string }> }
      | undefined;
    const job = scan?.jobs?.[0];
    if (scan && job) {
      onLaunched?.({
        scanId: scan.id,
        jobId: job.id,
        scannerName: job.scannerName ?? scanner,
        target: job.target ?? target,
      });
    }
    setTarget('');
    setOptionsJson('');
  }

  async function killSwitch() {
    if (!engagementId) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    await cancelAll({ variables: { engagementId } });
    setArmed(false);
  }

  const launching = launchingScan || launchingTemplate;
  const error = mode === 'template' ? templateError : scanError;
  const inputClass =
    'rounded-md border border-space-800 bg-space-900 px-2 py-1 text-sm text-slate-100';

  return (
    <div
      aria-label="cockpit-command-bar"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-space-800 bg-space-900/60 px-4 py-3"
    >
      {/* Mode toggle: single scanner vs multi-step chain */}
      <div className="flex rounded-md border border-space-800 bg-space-900 p-0.5 text-xs">
        {(['scanner', 'template', 'kali'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-label={`mode-${m}`}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`rounded px-2.5 py-1 ${
              mode === m ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {m === 'scanner' ? 'Scanner' : m === 'template' ? 'Chaîne' : 'Kali'}
          </button>
        ))}
      </div>

      {mode !== 'kali' ? (
        <input
          aria-label="quick-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="IP / domaine / URL"
          className={`w-56 ${inputClass}`}
        />
      ) : null}

      {mode === 'scanner' ? (
        <>
          <select
            aria-label="quick-scanner"
            value={scanner}
            onChange={(e) => setScanner(e.target.value)}
            className={`w-48 ${inputClass}`}
          >
            {groupedScanners.length === 0 ? (
              <option value={scanner}>{scanner}</option>
            ) : (
              groupedScanners.map(([cat, entries]) => (
                <optgroup key={cat} label={cat}>
                  {entries.map((e) => (
                    <option key={e.name} value={e.name}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              ))
            )}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-400">
            <input
              type="checkbox"
              aria-label="show-all-scanners"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            tous
          </label>
          <button
            type="button"
            aria-label="toggle-options"
            onClick={() => setShowOptions((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Options {showOptions ? '▲' : '▼'}
          </button>
        </>
      ) : mode === 'template' ? (
        <select
          aria-label="quick-template"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className={`w-56 ${inputClass}`}
        >
          {templates.length === 0 ? (
            <option value="">—</option>
          ) : (
            templates.map((t) => (
              <option key={t.id} value={t.name}>
                {t.displayName || t.name}
              </option>
            ))
          )}
        </select>
      ) : null}

      {mode !== 'kali' ? (
        <button
          type="button"
          onClick={() => void launch()}
          disabled={!scoped || !target || launching}
          className="rounded-md bg-neon-cyan/20 px-3 py-1 text-sm text-neon-cyan hover:bg-neon-cyan/30 disabled:opacity-40"
        >
          Run
        </button>
      ) : null}

      {mode === 'scanner' && detected && !showAll ? (
        <span className="text-xs text-slate-500">
          cible : {TARGET_TYPE_LABEL[detected] ?? detected} · {visibleScannerNames.size} scanners
        </span>
      ) : null}

      {!scoped ? (
        <span className="text-xs text-slate-500">
          Sélectionne un périmètre pour lancer un scan.
        </span>
      ) : null}
      {notice ? <span className="text-xs text-neon-cyan">{notice}</span> : null}
      {error ? (
        <span role="alert" className="text-xs text-rose-400">
          Échec : {error.message}
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {pills.map((p) => (
          <HealthPill key={p.label} data={p} />
        ))}
        <button
          type="button"
          onClick={() => void killSwitch()}
          disabled={!scoped || killing}
          className={`rounded-md px-3 py-1 text-sm disabled:opacity-40 ${
            armed ? 'bg-rose-600 text-white' : 'bg-rose-900/50 text-rose-200 hover:bg-rose-800/60'
          }`}
        >
          {armed ? 'Confirmer kill' : 'Kill-switch'}
        </button>
      </div>

      {mode === 'scanner' && showOptions ? (
        <div className="w-full basis-full border-t border-space-800 pt-3">
          <ScannerOptionsForm entry={selectedEntry} target={target} onChange={setOptionsJson} />
        </div>
      ) : null}

      {mode === 'kali' ? (
        <div className="w-full basis-full border-t border-space-800 pt-3">
          <KaliToolLauncher
            engagementId={engagementId}
            group="RECON"
            onLaunched={(id) => {
              setNotice(`Outil Kali lancé (run ${id}).`);
              onLaunched?.({ scanId: id, jobId: id, scannerName: 'kali', target: '' });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
