import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ALL_CORRELATED_FINDINGS_QUERY } from '../../../lib/graphql/queries';
import { VulnerabilitiesView } from '../vulnerabilities-view';

const mockFindings = [
  {
    __typename: 'CorrelatedFinding',
    id: 'cf-1',
    engagementId: 'eng-1',
    title: 'Remote Code Execution',
    severity: 'CRITICAL',
    cveId: 'CVE-1',
    status: 'OPEN',
    sourceCount: 2,
    sources: ['nmap', 'nuclei'],
    riskScore: 9.8,
    assetId: 'asset-1',
    assetValue: '192.168.1.1',
    lastSeenAt: '2024-01-15T00:00:00Z',
  },
  {
    __typename: 'CorrelatedFinding',
    id: 'cf-2',
    engagementId: 'eng-1',
    title: 'Information Disclosure',
    severity: 'LOW',
    cveId: null,
    status: 'TRIAGED',
    sourceCount: 1,
    sources: ['nmap'],
    riskScore: 2.1,
    assetId: 'asset-2',
    assetValue: '192.168.1.2',
    lastSeenAt: '2024-01-14T00:00:00Z',
  },
];

const defaultMock = {
  request: {
    query: ALL_CORRELATED_FINDINGS_QUERY,
    variables: { filter: {} },
  },
  result: {
    data: {
      allCorrelatedFindings: mockFindings,
    },
  },
};

describe('<VulnerabilitiesView />', () => {
  it('renders a vuln row (title visible) after load', async () => {
    render(
      <MockedProvider mocks={[defaultMock]}>
        <VulnerabilitiesView />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByText('Remote Code Execution')).toBeInTheDocument());
    expect(screen.getByLabelText('vulnerabilities-view')).toBeInTheDocument();
  });

  it('switching group axis to "Outil" shows a tool group header', async () => {
    render(
      <MockedProvider mocks={[defaultMock]}>
        <VulnerabilitiesView />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByText('Remote Code Execution')).toBeInTheDocument());

    const axisSelector = screen.getByLabelText('vuln-group-axis');
    const outilButton = Array.from(axisSelector.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Outil',
    );
    expect(outilButton).toBeTruthy();
    await userEvent.click(outilButton!);

    // After switching to 'Outil', 'nuclei' appears as a group header label
    await waitFor(() => {
      const allNuclei = screen.getAllByText('nuclei');
      // At least one should be a group header (span with font-medium class)
      const groupHeader = allNuclei.find(
        (el) => el.tagName === 'SPAN' && el.className.includes('font-medium'),
      );
      expect(groupHeader).toBeInTheDocument();
    });
  });

  it('clicking a row calls onSelect with its id', async () => {
    const onSelect = vi.fn();
    render(
      <MockedProvider mocks={[defaultMock]}>
        <VulnerabilitiesView onSelect={onSelect} />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByText('Remote Code Execution')).toBeInTheDocument());

    const row = screen.getByText('Remote Code Execution').closest('[role="button"]');
    expect(row).toBeTruthy();
    await userEvent.click(row!);

    expect(onSelect).toHaveBeenCalledWith('cf-1');
  });
});
