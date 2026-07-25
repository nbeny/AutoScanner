import { useScope } from '../../lib/scope-context';
import { useEngagementName } from '../../lib/use-engagement-name';
import { ScoredAssetsPanel } from '../engagements/engagement-assets-tab';

export function TargetsLibraryPage() {
  const { engagementId } = useScope();
  const name = useEngagementName(engagementId ?? undefined);
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-8" aria-label="targets-library">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bibliothèque de cibles</h1>
        <code className="text-xs text-slate-400">
          {engagementId ? `périmètre ${name ?? engagementId.slice(0, 8)}` : 'Tous les périmètres'}
        </code>
      </header>
      <ScoredAssetsPanel engagementId={engagementId ?? undefined} />
    </div>
  );
}
