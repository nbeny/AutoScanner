import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  CORRELATED_FINDINGS_QUERY,
  CORRELATED_FINDING_DETAIL_QUERY,
} from '../../../../lib/graphql/queries';
import { TriageWorkspace } from '../triage-workspace';

const engagementId = 'eng_1';

const listMock = {
  request: { query: CORRELATED_FINDINGS_QUERY, variables: { engagementId } },
  result: {
    data: {
      correlatedFindings: [
        {
          id: 'cf_1',
          title: 'RCE Apache Struts',
          severity: 'CRITICAL',
          cveId: 'CVE-2017-5638',
          status: 'OPEN',
          sourceCount: 1,
          sources: ['nuclei'],
          riskScore: 9.8,
          assetId: 'a1',
          lastSeenAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    },
  },
};

const detailMock = {
  request: { query: CORRELATED_FINDING_DETAIL_QUERY, variables: { id: 'cf_1' } },
  result: {
    data: {
      correlatedFinding: {
        id: 'cf_1',
        title: 'RCE Apache Struts',
        severity: 'CRITICAL',
        status: 'OPEN',
        riskScore: 9.8,
        assetId: 'a1',
        assetValue: '10.0.0.4',
        cveId: 'CVE-2017-5638',
        cvssScore: 9.8,
        cvssVector: 'AV:N',
        sources: ['nuclei'],
        evidence: [],
        note: null,
        remediation: null,
        statusHistory: [],
      },
    },
  },
};

function renderWorkspace(mocks: unknown[]) {
  return render(
    <MemoryRouter>
      <MockedProvider mocks={mocks as never}>
        <TriageWorkspace engagementId={engagementId} />
      </MockedProvider>
    </MemoryRouter>,
  );
}

describe('<TriageWorkspace />', () => {
  it('auto-selects the first finding and shows its detail', async () => {
    renderWorkspace([listMock, detailMock]);
    expect(await screen.findByText('10.0.0.4')).toBeInTheDocument();
  });

  it('shows empty state when no findings', async () => {
    const emptyMock = {
      request: { query: CORRELATED_FINDINGS_QUERY, variables: { engagementId } },
      result: { data: { correlatedFindings: [] } },
    };
    renderWorkspace([emptyMock]);
    expect(await screen.findByText(/no findings to triage/i)).toBeInTheDocument();
  });

  it('hides RESOLVED/FALSE_POSITIVE by default and reveals them via the toggle', async () => {
    const mixedList = {
      request: { query: CORRELATED_FINDINGS_QUERY, variables: { engagementId } },
      result: {
        data: {
          correlatedFindings: [
            { ...listMock.result.data.correlatedFindings[0] },
            {
              id: 'cf_2',
              title: 'Old resolved issue',
              severity: 'LOW',
              cveId: null,
              status: 'RESOLVED',
              sourceCount: 1,
              sources: ['nmap'],
              riskScore: 0.5,
              assetId: 'a2',
              lastSeenAt: '2026-05-01T00:00:00.000Z',
            },
          ],
        },
      },
    };
    renderWorkspace([mixedList, detailMock]);
    await screen.findByText('RCE Apache Struts');
    expect(screen.queryByText('Old resolved issue')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show all statuses/i }));
    expect(screen.getByText('Old resolved issue')).toBeInTheDocument();
  });

  it('filters the queue by severity', async () => {
    renderWorkspace([listMock, detailMock]);
    await screen.findByText('RCE Apache Struts');
    fireEvent.change(screen.getByLabelText('severity-filter'), { target: { value: 'HIGH' } });
    expect(screen.queryByText('RCE Apache Struts')).not.toBeInTheDocument();
  });
});
