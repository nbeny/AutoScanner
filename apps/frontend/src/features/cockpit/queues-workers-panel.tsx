import { useQuery } from '@apollo/client';
import { Panel } from '../../components/ui/panel';
import { QUEUE_HEALTH_QUERY } from '../../lib/graphql/queries';

interface QueueHealth {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  workers: number;
}

export function QueuesWorkersPanel() {
  const { data } = useQuery<{ queueHealth: QueueHealth[] }>(QUEUE_HEALTH_QUERY, {
    pollInterval: 4000,
    fetchPolicy: 'cache-and-network',
  });
  const queues = data?.queueHealth ?? [];

  return (
    <Panel aria-label="queues-workers" className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide text-slate-500">Queues &amp; workers</h2>
      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="text-left font-normal">queue</th>
            <th className="font-normal">wait</th>
            <th className="font-normal">act</th>
            <th className="font-normal">fail</th>
            <th className="font-normal">wrk</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {queues.map((q) => (
            <tr
              key={q.name}
              aria-label={`queue-row-${q.name}`}
              className="border-t border-space-800"
            >
              <td className="py-1 text-left text-slate-300">{q.name}</td>
              <td className="text-center text-slate-400">{q.waiting}</td>
              <td className="text-center text-neon-cyan">{q.active}</td>
              <td className="text-center text-rose-400">{q.failed}</td>
              <td className="text-center text-slate-400">{q.workers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
