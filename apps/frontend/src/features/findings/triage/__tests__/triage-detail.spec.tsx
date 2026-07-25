import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { CORRELATED_FINDING_DETAIL_QUERY } from '../../../../lib/graphql/queries';
import { TriageDetail } from '../triage-detail';

const id = 'cf_1';

const detailMock = {
  request: { query: CORRELATED_FINDING_DETAIL_QUERY, variables: { id } },
  result: {
    data: {
      correlatedFinding: {
        id,
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
        evidence: [{ scannerName: 'nuclei', location: '/struts', evidenceJson: '{"p":1}' }],
        note: null,
        remediation: null,
        statusHistory: [],
      },
    },
  },
};

describe('<TriageDetail />', () => {
  it('renders nothing prompt when no id selected', () => {
    render(
      <MemoryRouter>
        <MockedProvider mocks={[]}>
          <TriageDetail id={null} onStatusChange={vi.fn()} />
        </MockedProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText(/select a finding/i)).toBeInTheDocument();
  });

  it('renders the finding detail from the query', async () => {
    render(
      <MemoryRouter>
        <MockedProvider mocks={[detailMock]}>
          <TriageDetail id={id} onStatusChange={vi.fn()} />
        </MockedProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('RCE Apache Struts')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.4')).toBeInTheDocument();
    expect(screen.getByText('CVE-2017-5638')).toBeInTheDocument();
    expect(screen.getByText(/CVSS 9.8/)).toBeInTheDocument();
  });

  it('links the CVE id out to NVD and the asset to its detail page', async () => {
    render(
      <MemoryRouter>
        <MockedProvider mocks={[detailMock]}>
          <TriageDetail id={id} onStatusChange={vi.fn()} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await screen.findByText('RCE Apache Struts');
    expect(screen.getByText('CVE-2017-5638').closest('a')).toHaveAttribute(
      'href',
      'https://nvd.nist.gov/vuln/detail/CVE-2017-5638',
    );
    expect(screen.getByText('10.0.0.4').closest('a')).toHaveAttribute('href', '/targets/a1');
  });

  it('renders the four status action buttons', async () => {
    render(
      <MemoryRouter>
        <MockedProvider mocks={[detailMock]}>
          <TriageDetail id={id} onStatusChange={vi.fn()} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await screen.findByText('RCE Apache Struts');
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /false-positive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resolve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^triage$/i })).toBeInTheDocument();
  });
});
