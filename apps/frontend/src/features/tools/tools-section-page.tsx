import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ToolsGrid } from './tools-grid';

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

  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  // Suppress unused-variable warning until drawer (FT4) is wired in
  void selectedTool;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-4" aria-label="tools-section">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Outils</h1>
        <ScopeBadge engagementId={engagementId} />
      </header>
      <ToolsGrid engagementId={engagementId} onSelectTool={setSelectedTool} />
    </div>
  );
}
