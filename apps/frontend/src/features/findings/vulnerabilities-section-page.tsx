import { useParams } from 'react-router-dom';

function ScopeBadge({ engagementId }: { engagementId?: string }) {
  return (
    <code className="text-xs text-slate-400" aria-label="scope-badge">
      {engagementId ? `engagement ${engagementId}` : 'Tous les engagements'}
    </code>
  );
}

export function VulnerabilitiesSectionPage({
  engagementId: propId,
}: { engagementId?: string } = {}) {
  const params = useParams<{ engagementId?: string }>();
  const engagementId = propId ?? params.engagementId;
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-4" aria-label="vulnerabilities-section">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vulnérabilités</h1>
        <ScopeBadge engagementId={engagementId} />
      </header>
      <p className="text-slate-500 text-sm">
        Vue de priorisation des failles — bientôt disponible (P2).
      </p>
    </div>
  );
}
