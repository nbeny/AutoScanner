import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { TOP_FINDINGS_QUERY } from '../../../../lib/graphql/queries';
import { TopFindingsList } from '../top-findings-list';

const engagementId = 'eng_1';

function mockTopFindings(items: unknown[]) {
  return {
    request: { query: TOP_FINDINGS_QUERY, variables: { engagementId, limit: 10 } },
    result: { data: { topFindings: items } },
  };
}

describe('<TopFindingsList />', () => {
  it('renders rows with title, severity, scanner badges, and affected count', async () => {
    render(
      <MemoryRouter>
        <MockedProvider
          mocks={[
            mockTopFindings([
              {
                __typename: 'TopFindingObject',
                dedupHash: 'h1',
                title: 'Critical CVE',
                severity: 'CRITICAL',
                cveId: 'CVE-2024-1',
                affectedAssetCount: 3,
                scannerSources: ['nuclei'],
                firstSeenAt: '2026-05-01T00:00:00Z',
                lastSeenAt: '2026-05-02T00:00:00Z',
                exampleAssetId: 'a_1',
              },
            ]),
          ]}
        >
          <TopFindingsList engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Critical CVE')).toBeInTheDocument());
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('nuclei')).toBeInTheDocument();
    expect(screen.getByText('3 assets')).toBeInTheDocument();
    expect(screen.getByText('CVE-2024-1')).toBeInTheDocument();
  });

  it('renders empty state when no findings', async () => {
    render(
      <MemoryRouter>
        <MockedProvider mocks={[mockTopFindings([])]}>
          <TopFindingsList engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/No findings yet/i)).toBeInTheDocument());
  });

  it('uses "1 asset" singular when affectedAssetCount = 1', async () => {
    render(
      <MemoryRouter>
        <MockedProvider
          mocks={[
            mockTopFindings([
              {
                __typename: 'TopFindingObject',
                dedupHash: 'h1',
                title: 'Solo',
                severity: 'HIGH',
                cveId: null,
                affectedAssetCount: 1,
                scannerSources: ['nuclei'],
                firstSeenAt: '2026-05-01T00:00:00Z',
                lastSeenAt: '2026-05-02T00:00:00Z',
                exampleAssetId: 'a_1',
              },
            ]),
          ]}
        >
          <TopFindingsList engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('1 asset')).toBeInTheDocument());
  });
});
