import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client';

import {
  GENERATE_REPORT_MUTATION,
  REPORTS_QUERY,
  REPORT_TEMPLATES_QUERY,
} from '../../lib/graphql/queries';

type ReportFormat = 'PDF' | 'CSV' | 'SARIF' | 'JSON';

interface ReportTemplateRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  format: ReportFormat;
  isDefault: boolean;
}

interface ReportTemplatesResult {
  reportTemplates: ReportTemplateRow[];
}

interface GenerateReportResult {
  generateReport: {
    id: string;
    status: string;
    format: ReportFormat;
    template: { id: string; slug: string; name: string };
  };
}

export function GenerateReportButton({ engagementId }: { engagementId: string }) {
  const [open, setOpen] = useState(false);
  const [templateSlug, setTemplateSlug] = useState('');
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const {
    data: tmplData,
    loading: tmplLoading,
    error: tmplError,
  } = useQuery<ReportTemplatesResult>(REPORT_TEMPLATES_QUERY);

  const [generateReport, { loading: submitting, error: submitError }] =
    useMutation<GenerateReportResult>(GENERATE_REPORT_MUTATION, {
      refetchQueries: [{ query: REPORTS_QUERY, variables: { engagementId } }],
    });

  useEffect(() => {
    if (!templateSlug && tmplData?.reportTemplates?.length) {
      setTemplateSlug(tmplData.reportTemplates[0].slug);
    }
  }, [tmplData, templateSlug]);

  const disabled = submitting || !templateSlug;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    try {
      const res = await generateReport({
        variables: { input: { engagementId, templateSlug } },
      });
      const id = res.data?.generateReport?.id;
      if (id) {
        setConfirmation(`Rapport ${id} en cours de génération…`);
        setOpen(false);
      }
    } catch {
      // surfaced via submitError
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        {confirmation ? (
          <span className="text-xs text-emerald-300" role="status">
            {confirmation}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-sm rounded px-3 py-1"
          aria-label="Open generate report panel"
        >
          Générer rapport
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-slate-900 p-3 rounded flex flex-wrap items-end gap-2"
      aria-label="generate-report"
    >
      <label>
        <span className="block text-xs text-slate-300">Template</span>
        <select
          aria-label="Template"
          className="mt-1 bg-slate-800 rounded px-2 py-1 text-sm"
          value={templateSlug}
          onChange={(e) => setTemplateSlug(e.target.value)}
          disabled={tmplLoading || !tmplData?.reportTemplates?.length}
          required
        >
          {!templateSlug ? <option value="">— select —</option> : null}
          {tmplData?.reportTemplates?.map((t) => (
            <option key={t.id} value={t.slug}>
              {t.name} ({t.format})
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={disabled}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded px-3 py-1 text-sm"
      >
        {submitting ? 'Génération…' : 'Générer'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-slate-300 text-sm hover:underline"
      >
        Annuler
      </button>

      {tmplError ? (
        <p className="basis-full text-sm text-red-400" role="alert">
          {tmplError.message}
        </p>
      ) : null}
      {submitError ? (
        <p className="basis-full text-sm text-red-400" role="alert">
          {submitError.message}
        </p>
      ) : null}
    </form>
  );
}
