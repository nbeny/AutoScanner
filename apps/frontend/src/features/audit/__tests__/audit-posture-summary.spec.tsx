import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import {
  ALL_CORRELATED_FINDINGS_QUERY,
  COVERAGE_SUMMARY_QUERY,
} from '../../../lib/graphql/queries';
import { AuditPostureSummary } from '../audit-posture-summary';

const findingsMock = {
  request: { query: ALL_CORRELATED_FINDINGS_QUERY, variables: { filter: undefined } },
  result: {
    data: {
      allCorrelatedFindings: [
        {
          id: 'f1',
          engagementId: 'e1',
          title: 'A',
          severity: 'CRITICAL',
          cveId: null,
          status: 'OPEN',
          sourceCount: 1,
          sources: [],
          riskScore: 9,
          assetId: 'a1',
          assetValue: 'x',
          lastSeenAt: '2026-01-01',
        },
        {
          id: 'f2',
          engagementId: 'e1',
          title: 'B',
          severity: 'CRITICAL',
          cveId: null,
          status: 'OPEN',
          sourceCount: 1,
          sources: [],
          riskScore: 8,
          assetId: 'a2',
          assetValue: 'y',
          lastSeenAt: '2026-01-01',
        },
        {
          id: 'f3',
          engagementId: 'e1',
          title: 'C',
          severity: 'HIGH',
          cveId: null,
          status: 'OPEN',
          sourceCount: 1,
          sources: [],
          riskScore: 7,
          assetId: 'a3',
          assetValue: 'z',
          lastSeenAt: '2026-01-01',
        },
      ],
    },
  },
};
const coverageMock = {
  request: { query: COVERAGE_SUMMARY_QUERY, variables: { engagementId: undefined } },
  result: { data: { coverageSummary: { totalAssets: 10, scannedAssets: 8, percent: 80 } } },
};

describe('<AuditPostureSummary />', () => {
  it('shows severity counts derived from findings and the coverage percent', async () => {
    render(
      <MockedProvider mocks={[findingsMock, coverageMock]} addTypename={false}>
        <AuditPostureSummary engagementId={undefined} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('posture-summary')).toBeInTheDocument());
    expect(screen.getByLabelText('sev-CRITICAL')).toHaveTextContent('2');
    expect(screen.getByLabelText('sev-HIGH')).toHaveTextContent('1');
    await waitFor(() => expect(screen.getByLabelText('coverage')).toHaveTextContent('80'));
  });
});
