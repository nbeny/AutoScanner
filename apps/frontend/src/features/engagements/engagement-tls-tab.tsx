import { useQuery } from '@apollo/client';
import { TLS_CERTIFICATES_QUERY } from '../../lib/graphql/queries';
import { formatDate } from '../../lib/format-date';

interface TlsCertificateRow {
  id: string;
  host: string;
  subjectCn: string;
  issuerCn: string;
  notAfter: string;
  tlsVersion: string;
  selfSigned: boolean;
  expired: boolean;
  source: string;
  lastSeenAt: string;
}

export function EngagementTlsTab({ engagementId }: { engagementId: string }) {
  const { data, loading, error } = useQuery<{ tlsCertificates: TlsCertificateRow[] }>(
    TLS_CERTIFICATES_QUERY,
    { variables: { engagementId } },
  );

  if (loading) return <p className="text-slate-400 text-sm">Loading TLS certificates…</p>;
  if (error)
    return (
      <p className="text-red-400" role="alert">
        {error.message}
      </p>
    );

  const certs = data?.tlsCertificates ?? [];

  if (certs.length === 0) {
    return <p className="text-slate-500 text-sm">No TLS certificates found.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">TLS Certificates ({certs.length})</h3>
      <table className="w-full text-sm">
        <thead className="text-slate-400 text-left">
          <tr>
            <th className="py-2">Host</th>
            <th>Subject</th>
            <th>Issuer</th>
            <th>Expires</th>
            <th>TLS Version</th>
            <th>Flags</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {certs.map((cert) => (
            <tr key={cert.id} className="border-t border-slate-800">
              <td className="py-2 font-mono">{cert.host}</td>
              <td className="font-mono text-xs">{cert.subjectCn}</td>
              <td className="text-xs text-slate-400">{cert.issuerCn}</td>
              <td className="text-xs text-slate-400">{formatDate(cert.notAfter)}</td>
              <td className="font-mono text-xs">{cert.tlsVersion}</td>
              <td className="text-xs">
                {cert.selfSigned && (
                  <span className="inline-block bg-yellow-900 text-yellow-300 rounded px-1 py-0.5 mr-1">
                    self-signed
                  </span>
                )}
                {cert.expired && (
                  <span className="inline-block bg-red-900 text-red-300 rounded px-1 py-0.5">
                    expired
                  </span>
                )}
              </td>
              <td className="text-xs text-slate-400">{cert.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
