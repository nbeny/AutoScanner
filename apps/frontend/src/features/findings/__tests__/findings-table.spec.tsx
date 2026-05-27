import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FINDINGS_QUERY } from '../../../lib/graphql/queries';
import { FindingsTable } from '../findings-table';

const engagementId = 'eng_1';

const baseFindings = [
  {
    id: 'f_1',
    title: 'SQL injection',
    severity: 'CRITICAL',
    location: 'https://example.com/login',
    cveId: 'CVE-2024-0001',
    templateId: 'sqli',
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'f_2',
    title: 'Outdated banner',
    severity: 'LOW',
    location: 'tcp/22',
    cveId: null,
    templateId: 'banner',
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-02T00:00:00.000Z',
  },
];

const unfilteredMock = {
  request: { query: FINDINGS_QUERY, variables: { engagementId, severities: null } },
  result: { data: { findings: baseFindings } },
};

const criticalOnlyMock = {
  request: {
    query: FINDINGS_QUERY,
    variables: { engagementId, severities: ['CRITICAL'] },
  },
  result: { data: { findings: [baseFindings[0]] } },
};

describe('<FindingsTable />', () => {
  it('renders findings rows from the query', async () => {
    render(
      <MockedProvider mocks={[unfilteredMock]}>
        <FindingsTable engagementId={engagementId} />
      </MockedProvider>,
    );
    expect(await screen.findByText('SQL injection')).toBeInTheDocument();
    expect(screen.getByText('Outdated banner')).toBeInTheDocument();
    expect(screen.getByText('CVE-2024-0001')).toBeInTheDocument();
  });

  it('renders five severity checkboxes (CRITICAL HIGH MEDIUM LOW INFO)', async () => {
    render(
      <MockedProvider mocks={[unfilteredMock]}>
        <FindingsTable engagementId={engagementId} />
      </MockedProvider>,
    );
    expect(screen.getByLabelText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByLabelText('HIGH')).toBeInTheDocument();
    expect(screen.getByLabelText('MEDIUM')).toBeInTheDocument();
    expect(screen.getByLabelText('LOW')).toBeInTheDocument();
    expect(screen.getByLabelText('INFO')).toBeInTheDocument();
  });

  it('re-fires the query with a filtered severities array when checkboxes change', async () => {
    render(
      <MockedProvider mocks={[unfilteredMock, criticalOnlyMock]}>
        <FindingsTable engagementId={engagementId} />
      </MockedProvider>,
    );
    // initial render with all checkboxes on
    await screen.findByText('SQL injection');
    expect(screen.getByText('Outdated banner')).toBeInTheDocument();

    // Uncheck everything except CRITICAL
    fireEvent.click(screen.getByLabelText('HIGH'));
    fireEvent.click(screen.getByLabelText('MEDIUM'));
    fireEvent.click(screen.getByLabelText('LOW'));
    fireEvent.click(screen.getByLabelText('INFO'));

    await waitFor(() => {
      expect(screen.queryByText('Outdated banner')).not.toBeInTheDocument();
    });
    expect(screen.getByText('SQL injection')).toBeInTheDocument();
  });
});
