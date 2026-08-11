import { SchedulesTab } from '../schedules/schedules-tab';
import { useParams } from 'react-router-dom';

export function EngagementPage() {
  const { engagementId } = useParams<{ engagementId: string }>();

  if (!engagementId) return <p className="p-8">Missing engagement id.</p>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Engagement</h1>
        <code className="text-xs text-slate-400">engagement {engagementId}</code>
      </header>

      <section>
        <SchedulesTab engagementId={engagementId} />
      </section>
    </div>
  );
}
