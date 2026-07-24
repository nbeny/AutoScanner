const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'STOPPED_CAP']);

/**
 * Renders the AI hunt's final audit narrative. `react-markdown` is not a
 * dependency, so the text is rendered as a pre-wrapped prose block.
 */
export function AuditPanel({ auditText, status }: { auditText: string | null; status: string }) {
  if (auditText) {
    return (
      <div className="bg-slate-900 rounded p-4" aria-label="audit-panel">
        <div className="whitespace-pre-wrap text-sm text-slate-200 leading-relaxed">
          {auditText}
        </div>
      </div>
    );
  }

  if (!TERMINAL.has(status)) {
    return (
      <p className="text-slate-500 text-sm" aria-label="audit-panel">
        Audit will appear when the hunt completes.
      </p>
    );
  }

  return (
    <p className="text-slate-500 text-sm" aria-label="audit-panel">
      No audit was produced for this hunt.
    </p>
  );
}
