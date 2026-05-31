interface Tech {
  id: string;
  name: string;
  version: string | null;
  source: string;
}
interface Dns {
  id: string;
  type: string;
  name: string;
  value: string;
}

export function AssetTechTab(props: { technologies: Tech[]; dnsRecords: Dns[] }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold mb-2">Technologies</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-1">Name</th>
              <th>Version</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {props.technologies.map((t) => (
              <tr key={t.id} className="border-t border-slate-800">
                <td className="py-1 font-mono">{t.name}</td>
                <td className="font-mono">{t.version ?? '—'}</td>
                <td className="text-xs text-slate-400">{t.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-2">DNS records</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-1">Type</th>
              <th>Name</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {props.dnsRecords.map((r) => (
              <tr key={r.id} className="border-t border-slate-800">
                <td className="py-1">{r.type}</td>
                <td className="font-mono">{r.name}</td>
                <td className="font-mono">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
