import { useParams } from 'react-router-dom';
import { ScansList } from './scans-list';

function ScopeBadge({ engagementId }: { engagementId?: string }) {
  return (
    <code className="text-xs text-slate-400" aria-label="scope-badge">
      {engagementId ? `engagement ${engagementId}` : 'Tous les engagements'}
    </code>
  );
}

export function ScansSectionPage({ engagementId: propId }: { engagementId?: string } = {}) {
  const params = useParams<{ engagementId?: string }>();
  const engagementId = propId ?? params.engagementId;
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-4" aria-label="scans-section">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Scans</h1>
        <ScopeBadge engagementId={engagementId} />
      </header>
      <ScansList engagementId={engagementId} />
    </div>
  );
}
