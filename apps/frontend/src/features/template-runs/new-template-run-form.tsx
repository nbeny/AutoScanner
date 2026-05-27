import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { RUN_TEMPLATE_MUTATION, SCAN_TEMPLATES_QUERY } from '../../lib/graphql/queries';

interface ScanTemplateRow {
  id: string;
  name: string;
  displayName: string;
  description?: string | null;
}

interface ScanTemplatesResult {
  scanTemplates: ScanTemplateRow[];
}

interface RunTemplateResult {
  runTemplate: {
    id: string;
    templateName: string;
    target: string;
    status: string;
  };
}

interface Props {
  engagementId: string;
}

export function NewTemplateRunForm({ engagementId }: Props) {
  const navigate = useNavigate();
  const {
    data: tmplData,
    loading: tmplLoading,
    error: tmplError,
  } = useQuery<ScanTemplatesResult>(SCAN_TEMPLATES_QUERY);

  const [templateName, setTemplateName] = useState('');
  const [target, setTarget] = useState('');

  const [runTemplate, { loading: starting, error: runError }] =
    useMutation<RunTemplateResult>(RUN_TEMPLATE_MUTATION);

  // Pre-select the first available template once the list loads.
  useEffect(() => {
    if (!templateName && tmplData?.scanTemplates && tmplData.scanTemplates.length > 0) {
      setTemplateName(tmplData.scanTemplates[0].name);
    }
  }, [tmplData, templateName]);

  const submitDisabled = starting || !templateName || target.trim().length === 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitDisabled) return;
    const res = await runTemplate({
      variables: { input: { engagementId, templateName, target } },
    });
    const created = res.data?.runTemplate;
    if (created) {
      navigate(`/engagements/${engagementId}/template-runs/${created.id}`);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-slate-900 p-4 rounded grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
      aria-label="run-template"
    >
      <label className="md:col-span-1">
        <span className="block text-xs text-slate-300">Template</span>
        <select
          aria-label="Template"
          className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          disabled={tmplLoading || !tmplData?.scanTemplates?.length}
          required
        >
          {!templateName ? <option value="">— select —</option> : null}
          {tmplData?.scanTemplates?.map((t) => (
            <option key={t.id} value={t.name}>
              {t.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className="md:col-span-2">
        <span className="block text-xs text-slate-300">Target</span>
        <input
          aria-label="Target"
          className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="example.com"
          required
        />
      </label>

      <button
        type="submit"
        disabled={submitDisabled}
        className="md:col-span-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded py-2"
      >
        {starting ? 'Starting…' : 'Run template'}
      </button>

      {tmplError ? (
        <p className="md:col-span-4 text-sm text-red-400" role="alert">
          {tmplError.message}
        </p>
      ) : null}
      {runError ? (
        <p className="md:col-span-4 text-sm text-red-400" role="alert">
          {runError.message}
        </p>
      ) : null}
    </form>
  );
}
