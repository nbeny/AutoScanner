import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  RUN_SCAN_MUTATION,
  RUN_TEMPLATE_MUTATION,
  SCANNER_CATALOG_QUERY,
  SCAN_TEMPLATES_QUERY,
} from '../../../lib/graphql/queries';
import { CockpitCommandBar } from '../cockpit-command-bar';

function catalogEntry(name: string, categories: string[]) {
  return {
    name,
    displayName: name,
    description: '',
    categories,
    requiresCredential: null,
    fields: [],
  };
}

const catalogMock = {
  request: { query: SCANNER_CATALOG_QUERY },
  result: {
    data: {
      scannerCatalog: [
        catalogEntry('nmap', ['port-scan']),
        catalogEntry('ike-scan', ['port-scan']),
        catalogEntry('subfinder', ['subdomain-enum']),
      ],
    },
  },
};

const templatesMock = {
  request: { query: SCAN_TEMPLATES_QUERY },
  result: {
    data: {
      scanTemplates: [
        { id: 't1', name: 'recon-passive', displayName: 'Passive Recon', description: '' },
      ],
    },
  },
};

describe('<CockpitCommandBar />', () => {
  it('disables launch and kill-switch without a scope', () => {
    render(
      <MockedProvider mocks={[catalogMock, templatesMock]} addTypename={false}>
        <CockpitCommandBar engagementId={undefined} pills={[]} />
      </MockedProvider>,
    );
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /kill/i })).toBeDisabled();
  });

  it('launches a single scanner with the scoped engagement', async () => {
    const runMock = {
      request: {
        query: RUN_SCAN_MUTATION,
        variables: {
          input: {
            engagementId: 'eng-1',
            scannerName: 'nmap',
            target: '10.0.0.1',
            optionsJson: '',
          },
        },
      },
      result: {
        data: {
          runScan: {
            id: 'scan-9',
            status: 'QUEUED',
            jobs: [{ id: 'job-1', scannerName: 'nmap', target: '10.0.0.1', status: 'QUEUED' }],
          },
        },
      },
    };
    const onLaunched = vi.fn();
    render(
      <MockedProvider mocks={[catalogMock, templatesMock, runMock]} addTypename={false}>
        <CockpitCommandBar engagementId="eng-1" pills={[]} onLaunched={onLaunched} />
      </MockedProvider>,
    );
    fireEvent.change(screen.getByLabelText('quick-target'), { target: { value: '10.0.0.1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(onLaunched).toHaveBeenCalledWith(
        expect.objectContaining({ scanId: 'scan-9', scannerName: 'nmap' }),
      ),
    );
  });

  it('filters the scanner list to the detected target type (IP hides domain-only tools)', async () => {
    render(
      <MockedProvider mocks={[catalogMock, templatesMock]} addTypename={false}>
        <CockpitCommandBar engagementId="eng-1" pills={[]} />
      </MockedProvider>,
    );
    // catalogue loads, then typing an IP should drop subfinder (domain-only).
    await screen.findByRole('option', { name: 'ike-scan' });
    fireEvent.change(screen.getByLabelText('quick-target'), { target: { value: '10.0.0.1' } });
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'subfinder' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('option', { name: 'ike-scan' })).toBeInTheDocument();
    // "tous" reveals every scanner again.
    fireEvent.click(screen.getByLabelText('show-all-scanners'));
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'subfinder' })).toBeInTheDocument(),
    );
  });

  it('launches a chain via runTemplate in template mode', async () => {
    const runTemplateMock = {
      request: {
        query: RUN_TEMPLATE_MUTATION,
        variables: {
          input: { engagementId: 'eng-1', templateName: 'recon-passive', target: 'example.com' },
        },
      },
      result: {
        data: {
          runTemplate: {
            id: 'run-1',
            templateName: 'recon-passive',
            target: 'example.com',
            status: 'PENDING',
            currentStepIndex: 0,
            startedAt: null,
            completedAt: null,
            errorMessage: null,
          },
        },
      },
    };
    render(
      <MockedProvider mocks={[catalogMock, templatesMock, runTemplateMock]} addTypename={false}>
        <CockpitCommandBar engagementId="eng-1" pills={[]} />
      </MockedProvider>,
    );
    fireEvent.click(screen.getByLabelText('mode-template'));
    await screen.findByRole('option', { name: 'Passive Recon' });
    fireEvent.change(screen.getByLabelText('quick-target'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.getByText(/Chaîne .* lancée/)).toBeInTheDocument());
  });
});
