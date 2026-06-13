import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { CORRELATED_FINDINGS_QUERY } from '../../../lib/graphql/queries';
import { CorrelatedFindingsView } from '../correlated-findings-view';

const engagementId = 'eng_1';

const clusters = [
  {
    id: 'cf_1',
    title: 'SSL Certificate Expired',
    severity: 'CRITICAL',
    cveId: 'CVE-2024-9999',
    status: 'OPEN',
    sourceCount: 3,
    sources: ['nuclei', 'tlsx', 'sslscan'],
    lastSeenAt: '2026-06-01T12:00:00.000Z',
  },
  {
    id: 'cf_2',
    title: 'Weak cipher suite',
    severity: 'MEDIUM',
    cveId: null,
    status: 'OPEN',
    sourceCount: 1,
    sources: ['sslscan'],
    lastSeenAt: '2026-06-02T08:00:00.000Z',
  },
];

const queryMock = {
  request: { query: CORRELATED_FINDINGS_QUERY, variables: { engagementId } },
  result: { data: { correlatedFindings: clusters } },
};

const emptyMock = {
  request: { query: CORRELATED_FINDINGS_QUERY, variables: { engagementId } },
  result: { data: { correlatedFindings: [] } },
};

describe('<CorrelatedFindingsView />', () => {
  it('renders cluster titles from the query', async () => {
    render(
      <MockedProvider mocks={[queryMock]}>
        <CorrelatedFindingsView engagementId={engagementId} />
      </MockedProvider>,
    );
    expect(await screen.findByText('SSL Certificate Expired')).toBeInTheDocument();
    expect(screen.getByText('Weak cipher suite')).toBeInTheDocument();
  });

  it('renders severity badges', async () => {
    render(
      <MockedProvider mocks={[queryMock]}>
        <CorrelatedFindingsView engagementId={engagementId} />
      </MockedProvider>,
    );
    await screen.findByText('SSL Certificate Expired');
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
  });

  it('renders the sources badge with sourceCount and source names', async () => {
    render(
      <MockedProvider mocks={[queryMock]}>
        <CorrelatedFindingsView engagementId={engagementId} />
      </MockedProvider>,
    );
    await screen.findByText('SSL Certificate Expired');
    // sourceCount displayed as a number
    expect(screen.getByText('3')).toBeInTheDocument();
    // sources joined in the badge
    expect(screen.getByText('nuclei, tlsx, sslscan')).toBeInTheDocument();
  });

  it('renders a status dropdown with all 5 options for each cluster', async () => {
    render(
      <MockedProvider mocks={[queryMock]}>
        <CorrelatedFindingsView engagementId={engagementId} />
      </MockedProvider>,
    );
    await screen.findByText('SSL Certificate Expired');

    const dropdowns = screen.getAllByRole('combobox');
    expect(dropdowns).toHaveLength(2);

    // Each dropdown has the 5 status options
    const firstDropdown = dropdowns[0];
    const options = firstDropdown.querySelectorAll('option');
    expect(options).toHaveLength(5);
    const optionValues = Array.from(options).map((o) => o.value);
    expect(optionValues).toContain('OPEN');
    expect(optionValues).toContain('TRIAGED');
    expect(optionValues).toContain('CONFIRMED');
    expect(optionValues).toContain('FALSE_POSITIVE');
    expect(optionValues).toContain('RESOLVED');
  });

  it('shows loading state initially', () => {
    render(
      <MockedProvider mocks={[queryMock]}>
        <CorrelatedFindingsView engagementId={engagementId} />
      </MockedProvider>,
    );
    expect(screen.getByText('Loading correlated findings…')).toBeInTheDocument();
  });

  it('shows empty state when no clusters returned', async () => {
    render(
      <MockedProvider mocks={[emptyMock]}>
        <CorrelatedFindingsView engagementId={engagementId} />
      </MockedProvider>,
    );
    expect(await screen.findByText('No correlated findings yet.')).toBeInTheDocument();
  });
});
