import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLazyQuery, useQuery } from '@apollo/client';
import { ASSET_DETAIL_QUERY, ASSET_OBSERVATIONS_QUERY } from '../../lib/graphql/queries';
import { AssetHeader } from './asset-header';
import { AssetNetworkTab } from './asset-network-tab';
import { AssetTechTab } from './asset-tech-tab';
import { AssetFindingsTab } from './asset-findings-tab';
import { AssetProvenanceTab, type AssetProvenanceObservation } from './asset-provenance-tab';

interface ObservationsPage {
  items: AssetProvenanceObservation[];
  nextCursor: string | null;
  hasMore: boolean;
}

type Tab = 'provenance' | 'network' | 'tech' | 'findings';
const TABS: { key: Tab; label: string }[] = [
  { key: 'provenance', label: 'Provenance' },
  { key: 'network', label: 'Réseau' },
  { key: 'tech', label: 'Tech & DNS' },
  { key: 'findings', label: 'Findings' },
];

export function AssetDetailPage() {
  const { assetId } = useParams<{ engagementId: string; assetId: string }>();
  const [tab, setTab] = useState<Tab>('network');
  const { data, loading, error } = useQuery(ASSET_DETAIL_QUERY, {
    variables: { id: assetId },
    skip: !assetId,
  });

  // Observations pagination: the initial assetDetail load returns the
  // first 200; additional pages are fetched lazily via ASSET_OBSERVATIONS
  // and accumulated here. We reset when the assetId changes.
  const [extraPages, setExtraPages] = useState<AssetProvenanceObservation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);

  useEffect(() => {
    setExtraPages([]);
    setNextCursor(null);
    setHasMore(false);
  }, [assetId]);

  // Initial query returns up to 200 — assume more exists at the cap.
  useEffect(() => {
    const initial = data?.assetDetail?.observations as AssetProvenanceObservation[] | undefined;
    if (initial && initial.length >= 200) {
      const last = initial[initial.length - 1];
      setHasMore(true);
      // Cursor for fetching the next page: encode the oldest row currently
      // shown so the resolver returns strictly older observations.
      setNextCursor(btoa(`${new Date(last.ts).toISOString()}|${last.id}`));
    }
  }, [data]);

  const [fetchMore, { loading: loadingMore }] = useLazyQuery(ASSET_OBSERVATIONS_QUERY);

  const handleLoadMore = useCallback(async () => {
    if (!assetId || !nextCursor || loadingMore) return;
    const res = await fetchMore({
      variables: { assetId, after: nextCursor, limit: 200 },
    });
    const page = res.data?.assetObservations as ObservationsPage | undefined;
    if (!page) return;
    setExtraPages((prev) => [...prev, ...page.items]);
    setNextCursor(page.nextCursor);
    setHasMore(page.hasMore);
  }, [assetId, nextCursor, loadingMore, fetchMore]);

  if (!assetId) return <p className="p-8">Missing asset id.</p>;
  if (loading) return <p className="p-8 text-slate-400">Loading asset…</p>;
  if (error)
    return (
      <p className="p-8 text-red-400" role="alert">
        {error.message}
      </p>
    );
  const a = data?.assetDetail;
  if (!a) return <p className="p-8">Asset not found.</p>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <AssetHeader
        kind={a.kind}
        canonicalValue={a.canonicalValue}
        riskScore={a.riskScore}
        firstSeenAt={a.firstSeenAt}
        lastSeenAt={a.lastSeenAt}
        scannerSources={a.scannerSources}
      />

      <nav className="flex gap-2 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={
              'px-3 py-2 text-sm border-b-2 -mb-px ' +
              (tab === t.key
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200')
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section>
        {tab === 'provenance' ? (
          <AssetProvenanceTab
            observations={[
              ...((a.observations ?? []) as AssetProvenanceObservation[]),
              ...extraPages,
            ]}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
          />
        ) : null}
        {tab === 'network' ? (
          <AssetNetworkTab
            kind={a.kind}
            ports={a.ports}
            services={a.services}
            ipAddresses={a.ipAddresses}
            subdomains={a.subdomains}
          />
        ) : null}
        {tab === 'tech' ? (
          <AssetTechTab technologies={a.technologies} dnsRecords={a.dnsRecords} />
        ) : null}
        {tab === 'findings' ? <AssetFindingsTab findings={a.findings} /> : null}
      </section>
    </div>
  );
}
