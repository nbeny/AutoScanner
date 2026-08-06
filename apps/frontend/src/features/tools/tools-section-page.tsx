import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ToolsGrid } from './tools-grid';
import { CoverageHeatmap } from './coverage-heatmap';
import { ToolDetailDrawer } from './tool-detail-drawer';

function ScopeBadge({ engagementId }: { engagementId?: string }) {
  return (
    <code className="text-xs text-slate-400" aria-label="scope-badge">
      {engagementId ? `engagement ${engagementId}` : 'Tous les engagements'}
    </code>
  );
}

export function ToolsSectionPage({ engagementId: propId }: { engagementId?: string } = {}) {
  const params = useParams<{ engagementId?: string }>();
  const engagementId = propId ?? params.engagementId;
  const navigate = useNavigate();

  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  // "Lancer" pré-sélectionne le scanner sur la page Run-scan de l'engagement.
  // Sans engagement (vue globale), on ne peut pas cibler un run — bouton masqué.
  const onLaunch = engagementId
    ? (scannerName: string) =>
        navigate(`/engagements/${engagementId}/scans`, { state: { scanner: scannerName } })
    : undefined;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-4" aria-label="tools-section">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Outils</h1>
        <ScopeBadge engagementId={engagementId} />
      </header>
      <ToolsGrid engagementId={engagementId} onSelectTool={setSelectedTool} onLaunch={onLaunch} />
      <section aria-label="coverage-section" className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-200">Couverture</h2>
        <CoverageHeatmap engagementId={engagementId} />
      </section>
      <ToolDetailDrawer
        scannerName={selectedTool}
        engagementId={engagementId}
        onClose={() => setSelectedTool(null)}
      />
    </div>
  );
}
