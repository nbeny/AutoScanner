import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  ApolloClient,
  ApolloLink,
  ApolloProvider,
  InMemoryCache,
  Observable,
  type FetchResult,
} from '@apollo/client';
import { act, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import {
  EngagementUpdateKind,
  HEARTBEAT_MS,
  useEngagementUpdates,
} from '../use-engagement-updates';

function Harness({ engagementId }: { engagementId: string }) {
  useEngagementUpdates(engagementId);
  return null;
}

function makeClient(link: ApolloLink) {
  return new ApolloClient({ cache: new InMemoryCache(), link });
}

describe('useEngagementUpdates', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('refetches kind-mapped queries when subscription pushes an event', async () => {
    // Link that immediately emits one EngagementUpdated event for any subscription request.
    const link = new ApolloLink(
      () =>
        new Observable<FetchResult>((observer) => {
          observer.next({
            data: {
              engagementUpdated: {
                __typename: 'EngagementUpdateEvent',
                kind: EngagementUpdateKind.FINDING_RAISED,
                engagementId: 'eng_1',
                assetId: 'asset_1',
                templateRunId: null,
                ts: '2026-06-08T00:00:00Z',
              },
            },
          });
          // Keep the subscription open — frontend hook does not unsubscribe.
        }),
    );
    const client = makeClient(link);
    const refetchSpy = vi
      .spyOn(client, 'refetchQueries')
      .mockImplementation((() => []) as unknown as typeof client.refetchQueries);

    function Wrapper({ children }: { children: ReactNode }) {
      return <ApolloProvider client={client}>{children}</ApolloProvider>;
    }

    render(<Harness engagementId="eng_1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(refetchSpy).toHaveBeenCalled();
    });
    const args = refetchSpy.mock.calls[0][0] as { include: string[] };
    expect(args.include).toContain('Findings');
    expect(args.include).toContain('TopFindings');
  });

  it('triggers heartbeat refetch when no events arrive within HEARTBEAT_MS', async () => {
    vi.useFakeTimers();
    // Subscription link that never emits — heartbeat should fire on its own.
    const link = new ApolloLink(() => new Observable<FetchResult>(() => {}));
    const client = makeClient(link);
    const refetchSpy = vi
      .spyOn(client, 'refetchQueries')
      .mockImplementation((() => []) as unknown as typeof client.refetchQueries);

    function Wrapper({ children }: { children: ReactNode }) {
      return <ApolloProvider client={client}>{children}</ApolloProvider>;
    }

    render(<Harness engagementId="eng_1" />, { wrapper: Wrapper });

    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS + 100);
    });

    expect(refetchSpy).toHaveBeenCalledWith({
      include: ['EngagementOverview', 'RecentTemplateRuns'],
    });
  });
});
