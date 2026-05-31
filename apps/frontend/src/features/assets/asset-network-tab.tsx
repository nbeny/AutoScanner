interface Port {
  id: string;
  number: number;
  protocol: string;
  state: string;
  lastSeenAt: string;
}
interface Service {
  id: string;
  name: string | null;
  product: string | null;
  version: string | null;
}

export function AssetNetworkTab(props: {
  kind: string;
  ports: Port[];
  services: Service[];
  ipAddresses: string[];
  subdomains: string[];
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold mb-2">Ports</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-1">Port</th>
              <th>Proto</th>
              <th>State</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {props.ports.map((p) => (
              <tr key={p.id} className="border-t border-slate-800">
                <td className="py-1 font-mono">{p.number}</td>
                <td>{p.protocol}</td>
                <td>{p.state}</td>
                <td className="text-xs text-slate-400">
                  {p.lastSeenAt.slice(0, 16).replace('T', ' ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">Services</h3>
        <ul className="space-y-1 text-sm">
          {props.services.map((s) => (
            <li key={s.id} className="font-mono">
              {s.name ?? '—'} {s.product ? `· ${s.product}` : ''}{' '}
              {s.version ? `· ${s.version}` : ''}
            </li>
          ))}
        </ul>
      </section>

      {props.kind === 'SUBDOMAIN' && props.ipAddresses.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold mb-2">Resolved IPs</h3>
          <ul className="font-mono text-sm space-y-1">
            {props.ipAddresses.map((ip) => (
              <li key={ip}>{ip}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {props.kind === 'IP_ADDRESS' && props.subdomains.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold mb-2">Subdomains pointing here</h3>
          <ul className="font-mono text-sm space-y-1">
            {props.subdomains.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
