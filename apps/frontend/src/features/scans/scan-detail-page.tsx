import { useParams } from 'react-router-dom';
import { ScanDetailBody } from './scan-detail-body';

export function ScanDetailPage() {
  const { scanId } = useParams<{ scanId: string }>();

  if (!scanId) {
    return <p className="p-8 text-red-400">Missing scan id.</p>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Scan detail</h1>
      </header>
      <ScanDetailBody scanId={scanId} />
    </div>
  );
}
