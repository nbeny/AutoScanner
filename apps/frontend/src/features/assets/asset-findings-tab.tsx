interface Finding {
  id: string;
  title: string;
  severity: string;
  location: string | null;
  cveId: string | null;
  templateId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-700',
  HIGH: 'bg-orange-600',
  MEDIUM: 'bg-yellow-600',
  LOW: 'bg-slate-600',
  INFO: 'bg-slate-700',
};

export function AssetFindingsTab({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) return <p className="text-slate-500 text-sm">No findings yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-slate-400">
        <tr>
          <th className="py-2">Sev</th>
          <th>Title</th>
          <th>CVE</th>
          <th>Location</th>
          <th>CVE info</th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f) => (
          <tr key={f.id} className="border-t border-slate-800">
            <td className="py-2">
              <span
                className={`text-[10px] text-white px-1.5 py-0.5 rounded ${SEV_COLOR[f.severity]}`}
              >
                {f.severity}
              </span>
            </td>
            <td>{f.title}</td>
            <td className="font-mono text-xs">{f.cveId ?? '—'}</td>
            <td className="font-mono text-xs truncate max-w-xs">{f.location ?? '—'}</td>
            <td className="text-slate-500 text-xs">—</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
