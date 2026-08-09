import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { EXTRA_ARGS_KEY } from '@autoscanner/scanner-sdk';
import { SCANNER_USAGE_STATS_QUERY } from '../../lib/graphql/queries';
import type { ScannerCatalogEntry, ScannerCatalogField } from './scanner-catalog';

interface ScannerOptionsFormProps {
  entry: ScannerCatalogEntry | undefined;
  /** Receives the serialized options JSON ('' when there are no options set). */
  onChange: (optionsJson: string) => void;
  /** Lets a parent (e.g. the Kali doc panel) register a handler that appends a flag to extraArgs. */
  registerAddFlag?: (fn: (flag: string) => void) => void;
}

/** A field the operator explicitly toggles on/off (optional, no default). */
function isToggle(field: ScannerCatalogField): boolean {
  return !field.required && field.default === undefined;
}

function emptyValue(field: ScannerCatalogField): unknown {
  switch (field.type) {
    case 'boolean':
      return false;
    case 'enum':
      return field.enumValues?.[0] ?? '';
    case 'enum[]':
      return [] as string[];
    default:
      // string, number, string[], number[], unknown → edited as text
      return '';
  }
}

function initialValue(field: ScannerCatalogField): unknown {
  if (field.default !== undefined) {
    if (field.type === 'string[]' || field.type === 'number[]') {
      return Array.isArray(field.default) ? field.default.join(', ') : String(field.default ?? '');
    }
    if (field.type === 'enum[]') {
      return Array.isArray(field.default) ? (field.default as string[]) : [];
    }
    if (field.type === 'boolean') return Boolean(field.default);
    return field.default;
  }
  return emptyValue(field);
}

/** Coerce a raw editor value into the JSON value the scanner's schema expects. */
function coerce(field: ScannerCatalogField, raw: unknown): unknown | undefined {
  switch (field.type) {
    case 'boolean':
      return Boolean(raw);
    case 'number': {
      if (raw === '' || raw == null) return undefined;
      const n = Number(raw);
      return Number.isNaN(n) ? undefined : n;
    }
    case 'string':
    case 'enum':
    case 'unknown': {
      const s = String(raw ?? '');
      return s === '' ? undefined : s;
    }
    case 'string[]': {
      const parts = String(raw ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      return parts.length ? parts : undefined;
    }
    case 'number[]': {
      const parts = String(raw ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => !Number.isNaN(n));
      return parts.length ? parts : undefined;
    }
    case 'enum[]': {
      const arr = Array.isArray(raw) ? (raw as string[]) : [];
      return arr.length ? arr : undefined;
    }
    default:
      return undefined;
  }
}

export function ScannerOptionsForm({ entry, onChange, registerAddFlag }: ScannerOptionsFormProps) {
  const fields = useMemo(() => entry?.fields ?? [], [entry]);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [extraArgsText, setExtraArgsText] = useState('');

  useEffect(() => {
    registerAddFlag?.((flag: string) => setExtraArgsText((t) => (t ? `${t} ${flag}` : flag)));
  }, [registerAddFlag]);

  // Reset the form whenever the selected scanner changes.
  useEffect(() => {
    const nextValues: Record<string, unknown> = {};
    const nextEnabled: Record<string, boolean> = {};
    for (const field of fields) {
      nextValues[field.name] = initialValue(field);
      if (isToggle(field)) nextEnabled[field.name] = false;
    }
    setValues(nextValues);
    setEnabled(nextEnabled);
    setExtraArgsText('');
    // Depend on the scanner name so switching tools rebuilds the form.
  }, [entry?.name, fields]);

  // Emit the serialized options whenever the form state changes.
  useEffect(() => {
    const options: Record<string, unknown> = {};
    for (const field of fields) {
      if (isToggle(field) && !enabled[field.name]) continue;
      const value = coerce(field, values[field.name]);
      if (value !== undefined) options[field.name] = value;
    }
    const extra = extraArgsText
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (extra.length) options[EXTRA_ARGS_KEY] = extra;
    onChange(Object.keys(options).length ? JSON.stringify(options) : '');
  }, [fields, values, enabled, extraArgsText, onChange]);

  const { data: usageData } = useQuery<{
    scannerUsageStats: Array<{ optionsJson: string; count: number }>;
  }>(SCANNER_USAGE_STATS_QUERY, {
    skip: !entry,
    variables: entry ? { scannerName: entry.name } : undefined,
    fetchPolicy: 'cache-and-network',
  });
  const usage = (usageData?.scannerUsageStats ?? []).filter((u) => u.optionsJson !== '');

  if (!entry) return null;

  function applyPreset(options: Record<string, unknown>) {
    const { [EXTRA_ARGS_KEY]: presetExtra, ...rest } = options;
    setValues((prev) => ({ ...prev, ...rest }));
    setEnabled((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(rest)) next[key] = true;
      return next;
    });
    if (Array.isArray(presetExtra)) setExtraArgsText((presetExtra as string[]).join(' '));
  }

  const setValue = (name: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  return (
    <div className="space-y-3" aria-label="scanner-options-form">
      {entry.requiresCredential ? (
        <p className="text-xs text-amber-400">
          Nécessite une clé API : <strong>{entry.requiresCredential}</strong> (configurée dans les
          réglages).
        </p>
      ) : null}

      {entry.presets && entry.presets.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="scanner-presets">
          {entry.presets.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.description}
              onClick={() => applyPreset(p.options)}
              className="rounded-full border border-indigo-500/40 px-2 py-0.5 text-xs text-indigo-300 hover:bg-indigo-500/20"
            >
              {p.name}
            </button>
          ))}
        </div>
      ) : null}

      {usage.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="scanner-usage">
          <span className="text-[10px] uppercase text-slate-500">Souvent lancé</span>
          {usage.slice(0, 5).map((u) => (
            <button
              key={u.optionsJson}
              type="button"
              onClick={() => applyPreset(JSON.parse(u.optionsJson) as Record<string, unknown>)}
              className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-700"
            >
              {u.count}× {u.optionsJson}
            </button>
          ))}
        </div>
      ) : null}

      {fields.length === 0 ? (
        <p className="text-xs text-slate-400" aria-label="no-options">
          Cet outil n'a pas d'options configurables.
          {entry.requiresCredential ? ` Nécessite une clé API (${entry.requiresCredential}).` : ''}
        </p>
      ) : (
        fields.map((field) => {
          const toggle = isToggle(field);
          const active = !toggle || enabled[field.name];
          const value = values[field.name];

          return (
            <div key={field.name} className="space-y-1">
              <div className="flex items-center gap-2">
                {toggle ? (
                  <input
                    type="checkbox"
                    aria-label={`toggle-${field.name}`}
                    checked={Boolean(enabled[field.name])}
                    onChange={(e) =>
                      setEnabled((prev) => ({ ...prev, [field.name]: e.target.checked }))
                    }
                  />
                ) : null}
                <span className="text-xs font-medium text-slate-200">
                  {field.name}
                  {field.required ? <span className="text-red-400"> *</span> : null}
                </span>
                <span className="text-[10px] text-slate-500">{field.type}</span>
              </div>

              {field.description ? (
                <p className="text-[11px] text-slate-500">{field.description}</p>
              ) : null}

              {active ? renderControl(field, value, (v) => setValue(field.name, v)) : null}
            </div>
          );
        })
      )}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-200">Arguments bruts</span>
        <input
          type="text"
          aria-label="extra-args"
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm font-mono text-slate-100"
          value={extraArgsText}
          onChange={(e) => setExtraArgsText(e.target.value)}
          placeholder="ex. -sC -p 80 (séparés par des espaces)"
        />
        <span className="text-[10px] text-slate-500">
          Ajoutés tels quels à la commande. Un token = un argument (pas de guillemets).
        </span>
      </label>
    </div>
  );
}

function renderControl(field: ScannerCatalogField, value: unknown, onValue: (v: unknown) => void) {
  const label = `field-${field.name}`;
  const base = 'w-full bg-slate-800 rounded px-2 py-1 text-sm text-slate-100';

  switch (field.type) {
    case 'boolean':
      return (
        <input
          type="checkbox"
          aria-label={label}
          checked={Boolean(value)}
          onChange={(e) => onValue(e.target.checked)}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          aria-label={label}
          className={base}
          value={value === undefined || value === null ? '' : String(value)}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          onChange={(e) => onValue(e.target.value)}
        />
      );
    case 'enum':
      return (
        <select
          aria-label={label}
          className={base}
          value={String(value ?? '')}
          onChange={(e) => onValue(e.target.value)}
        >
          {(field.enumValues ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case 'enum[]': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-2" aria-label={label}>
          {(field.enumValues ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-1 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={(e) =>
                  onValue(e.target.checked ? [...selected, opt] : selected.filter((s) => s !== opt))
                }
              />
              {opt}
            </label>
          ))}
        </div>
      );
    }
    default:
      // string, string[], number[], unknown → text (arrays are comma-separated)
      return (
        <input
          type="text"
          aria-label={label}
          className={`${base} font-mono`}
          value={String(value ?? '')}
          placeholder={
            field.type === 'string[]' || field.type === 'number[]' ? 'séparés par des virgules' : ''
          }
          onChange={(e) => onValue(e.target.value)}
        />
      );
  }
}
