import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { VulnerabilitiesView } from './vulnerabilities-view';

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
  const [selected, setSelected] = useState<string | undefined>(undefined);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-4" aria-label="vulnerabilities-section">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vulnérabilités</h1>
        <ScopeBadge engagementId={engagementId} />
      </header>
      <VulnerabilitiesView engagementId={engagementId} onSelect={(id) => setSelected(id)} />
      {/* selected is used by FV4 drawer — unused for now */}
      {selected && null}
    </div>
  );
}
