import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MockedProvider, type MockedResponse } from '@apollo/client/testing';
import {
  KALI_TOOL_QUERY,
  PREVIEW_SCAN_COMMAND_QUERY,
  SCANNER_USAGE_STATS_QUERY,
} from '../../../lib/graphql/queries';
import { ScannerOptionsForm } from '../scanner-options-form';
import type { ScannerCatalogEntry } from '../scanner-catalog';

function usageStatsMock(scannerName: string): MockedResponse {
  return {
    request: { query: SCANNER_USAGE_STATS_QUERY, variables: { scannerName } },
    result: { data: { scannerUsageStats: [] } },
  };
}

const nmapLike: ScannerCatalogEntry = {
  name: 'nmap',
  displayName: 'Nmap',
  description: '',
  categories: ['port-scan'],
  requiresCredential: null,
  fields: [
    {
      name: 'ports',
      type: 'string',
      required: false,
      default: '1-1000',
      min: null,
      max: null,
      enumValues: null,
      description: null,
    },
    {
      name: 'osDetection',
      type: 'boolean',
      required: false,
      default: false,
      min: null,
      max: null,
      enumValues: null,
      description: null,
    },
    {
      name: 'timingTemplate',
      type: 'number',
      required: false,
      default: 4,
      min: 0,
      max: 5,
      enumValues: null,
      description: null,
    },
  ],
};

const nucleiLike: ScannerCatalogEntry = {
  name: 'nuclei',
  displayName: 'nuclei',
  description: '',
  categories: ['vuln-scan'],
  requiresCredential: null,
  fields: [
    {
      name: 'tags',
      type: 'string[]',
      required: false,
      default: undefined,
      min: null,
      max: null,
      enumValues: null,
      description: null,
    },
  ],
};

function lastEmitted(onChange: ReturnType<typeof vi.fn>): unknown {
  const call = onChange.mock.calls.at(-1);
  const json = (call?.[0] as string) ?? '';
  return json ? JSON.parse(json) : {};
}

describe('<ScannerOptionsForm />', () => {
  it('emits the defaulted values on mount', async () => {
    const onChange = vi.fn();
    render(
      <MockedProvider mocks={[usageStatsMock('nmap')]}>
        <ScannerOptionsForm entry={nmapLike} onChange={onChange} />
      </MockedProvider>,
    );
    await waitFor(() =>
      expect(lastEmitted(onChange)).toEqual({
        ports: '1-1000',
        osDetection: false,
        timingTemplate: 4,
      }),
    );
  });

  it('reflects an edited number field in the serialized options', async () => {
    const onChange = vi.fn();
    render(
      <MockedProvider mocks={[usageStatsMock('nmap')]}>
        <ScannerOptionsForm entry={nmapLike} onChange={onChange} />
      </MockedProvider>,
    );
    fireEvent.change(screen.getByLabelText('field-timingTemplate'), { target: { value: '2' } });
    await waitFor(() => expect(lastEmitted(onChange)).toMatchObject({ timingTemplate: 2 }));
  });

  it('omits an optional field until its toggle is enabled', async () => {
    const onChange = vi.fn();
    render(
      <MockedProvider mocks={[usageStatsMock('nuclei')]}>
        <ScannerOptionsForm entry={nucleiLike} onChange={onChange} />
      </MockedProvider>,
    );
    // Not enabled yet → no field-tags input, empty options.
    expect(screen.queryByLabelText('field-tags')).toBeNull();
    await waitFor(() => expect(lastEmitted(onChange)).toEqual({}));

    fireEvent.click(screen.getByLabelText('toggle-tags'));
    fireEvent.change(screen.getByLabelText('field-tags'), { target: { value: 'cve, rce' } });
    await waitFor(() => expect(lastEmitted(onChange)).toEqual({ tags: ['cve', 'rce'] }));
  });

  it('renders a no-options message for a credential-only scanner', () => {
    const onChange = vi.fn();
    const shodan: ScannerCatalogEntry = {
      name: 'shodan',
      displayName: 'Shodan',
      description: '',
      categories: ['osint'],
      requiresCredential: 'SHODAN',
      fields: [],
    };
    render(
      <MockedProvider mocks={[usageStatsMock('shodan')]}>
        <ScannerOptionsForm entry={shodan} onChange={onChange} />
      </MockedProvider>,
    );
    expect(screen.getByLabelText('no-options')).toBeInTheDocument();
    expect(screen.getByLabelText('no-options').textContent).toMatch(/SHODAN/);
  });
});

const nmapEntryWithKali: ScannerCatalogEntry = {
  name: 'nmap',
  displayName: 'nmap',
  description: 'Network mapper',
  categories: ['port-scan'],
  primaryCategory: 'port-scan',
  requiresCredential: null,
  kaliToolRef: 'nmap',
  fields: [
    {
      name: 'ports',
      type: 'string',
      required: false,
      default: '1-1000',
      min: null,
      max: null,
      enumValues: null,
      description: 'Ports',
    },
  ],
  presets: [],
};

const kaliMock: MockedResponse = {
  request: { query: KALI_TOOL_QUERY, variables: { binary: 'nmap' } },
  result: {
    data: {
      kaliTool: {
        binary: 'nmap',
        displayName: 'nmap',
        description: 'Network mapper',
        homepage: null,
        helpTextRaw: null,
        optionsSource: 'man',
        manTextRaw: null,
        options: [{ flag: '-sV', argHint: null, description: 'service/version' }],
      },
    },
  },
};

const previewMock: MockedResponse = {
  request: {
    query: PREVIEW_SCAN_COMMAND_QUERY,
    variables: { scannerName: 'nmap', target: 'scanme.example.com', optionsJson: '' },
  },
  result: {
    data: {
      previewScanCommand: { image: 'nmap:latest', argv: ['nmap', '-p', '1-1000'], note: null },
    },
  },
};

function renderComposer() {
  return render(
    <MockedProvider mocks={[usageStatsMock('nmap'), kaliMock, previewMock]} addTypename={false}>
      <ScannerOptionsForm
        entry={nmapEntryWithKali}
        target="scanme.example.com"
        onChange={() => undefined}
      />
    </MockedProvider>,
  );
}

describe('<ScannerOptionsForm /> composer', () => {
  it('collapses the typed field grid under "Options avancées" (closed by default)', () => {
    renderComposer();
    const advanced = screen.getByLabelText('advanced-options');
    expect(advanced).toBeInTheDocument();
    expect((advanced as HTMLDetailsElement).open).toBe(false);
  });

  it('shows the man-option palette and appends a clicked flag to raw args', async () => {
    renderComposer();
    await waitFor(() => expect(screen.getByLabelText('man-option--sV')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('man-option--sV'));
    expect((screen.getByLabelText('extra-args') as HTMLInputElement).value).toContain('-sV');
  });

  it('renders the live command preview from the server', async () => {
    renderComposer();
    await waitFor(() =>
      expect(screen.getByLabelText('command-preview').textContent).toContain('nmap -p 1-1000'),
    );
  });
});
