import { useQuery } from '@apollo/client';
import { Panel } from '../../components/ui/panel';
import { EMAILS_QUERY, ORG_METADATA_QUERY } from '../../lib/graphql/queries';
import { computePhishingExposure } from './phishing-exposure';
import { emailMatchesFocus, orgMetaMatchesFocus, type InvestigationFocus } from './seed-match';

interface EmailRow {
  id: string;
  address: string;
}
interface OrgMetaRow {
  id: string;
  data: unknown;
}

const SEV_COLOR: Record<string, string> = {
  HIGH: 'text-orange-400 border-orange-500/40',
  MEDIUM: 'text-amber-400 border-amber-500/40',
};

export function PhishingExposurePanel({
  engagementId,
  focus = null,
}: {
  engagementId?: string;
  focus?: InvestigationFocus | null;
}) {
  const emails = useQuery<{ emails: EmailRow[] }>(EMAILS_QUERY, {
    variables: { engagementId },
    skip: !engagementId,
    pollInterval: 4000,
    fetchPolicy: 'cache-and-network',
  });
  const orgMeta = useQuery<{ orgMetadata: OrgMetaRow[] }>(ORG_METADATA_QUERY, {
    variables: { engagementId },
    skip: !engagementId,
    pollInterval: 4000,
    fetchPolicy: 'cache-and-network',
  });

  const emailRows = (emails.data?.emails ?? []).filter((e) => emailMatchesFocus(focus, e));
  const orgRows = (orgMeta.data?.orgMetadata ?? []).filter((r) => orgMetaMatchesFocus(focus, r));
  const exposures = computePhishingExposure(emailRows, orgRows);

  return (
    <Panel aria-label="osint-phishing-exposure" className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide text-slate-500">
        Exposition phishing {exposures.length ? `(${exposures.length})` : ''}
      </h2>
      {!engagementId ? (
        <p className="text-sm text-slate-500">Sélectionne un périmètre.</p>
      ) : exposures.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun domaine spoofable corrélé pour l’instant.</p>
      ) : (
        <ul className="space-y-1.5">
          {exposures.map((x) => (
            <li key={x.domain} className="space-y-0.5 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 font-semibold ${SEV_COLOR[x.severity]}`}
                >
                  {x.severity}
                </span>
                <span className="truncate font-mono text-slate-200">{x.domain}</span>
                <span className="ml-auto text-slate-400">
                  {x.emailCount} email{x.emailCount > 1 ? 's' : ''}
                </span>
              </div>
              <p className="pl-1 text-slate-500">{x.weaknesses.join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
