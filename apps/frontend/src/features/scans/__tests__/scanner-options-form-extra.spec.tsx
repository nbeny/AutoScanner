import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MockedProvider, type MockedResponse } from '@apollo/client/testing';
import { SCANNER_USAGE_STATS_QUERY } from '../../../lib/graphql/queries';
import { ScannerOptionsForm } from '../scanner-options-form';
import type { ScannerCatalogEntry } from '../scanner-catalog';

const usageStatsMock: MockedResponse = {
  request: { query: SCANNER_USAGE_STATS_QUERY, variables: { scannerName: 'ffuf' } },
  result: { data: { scannerUsageStats: [] } },
};

const entry: ScannerCatalogEntry = {
  name: 'ffuf',
  displayName: 'ffuf',
  description: '',
  categories: ['web-enum'],
  requiresCredential: null,
  fields: [
    {
      name: 'threads',
      type: 'number',
      required: false,
      default: undefined,
      min: 1,
      max: 200,
      enumValues: null,
      description: 'threads',
    },
  ],
  presets: [
    { id: 'aggr', name: 'Agressif', description: '200 threads', options: { threads: 200 } },
  ],
} as ScannerCatalogEntry;

describe('ScannerOptionsForm — presets & extraArgs', () => {
  it('un clic sur une chip preset émet ses options', () => {
    const onChange = vi.fn();
    render(
      <MockedProvider mocks={[usageStatsMock]}>
        <ScannerOptionsForm entry={entry} onChange={onChange} />
      </MockedProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Agressif/ }));
    const last = onChange.mock.calls.at(-1)?.[0] as string;
    expect(JSON.parse(last)).toMatchObject({ threads: 200 });
  });

  it('le champ arguments bruts alimente extraArgs', () => {
    const onChange = vi.fn();
    render(
      <MockedProvider mocks={[usageStatsMock]}>
        <ScannerOptionsForm entry={entry} onChange={onChange} />
      </MockedProvider>,
    );
    fireEvent.change(screen.getByLabelText('extra-args'), { target: { value: '-sC -p 80' } });
    const last = onChange.mock.calls.at(-1)?.[0] as string;
    expect(JSON.parse(last).extraArgs).toEqual(['-sC', '-p', '80']);
  });
});

// SP2 — a generic Kali scanner (`{ target?, args?, preset? }`) whose example
// presets prefill the editable `args` field.
const kaliUsageMock: MockedResponse = {
  request: { query: SCANNER_USAGE_STATS_QUERY, variables: { scannerName: 'nmap' } },
  result: { data: { scannerUsageStats: [] } },
};

const kaliEntry: ScannerCatalogEntry = {
  name: 'nmap',
  displayName: 'nmap',
  description: '',
  categories: ['port-scan'],
  requiresCredential: null,
  fields: [
    {
      name: 'args',
      type: 'string',
      required: false,
      default: undefined,
      min: null,
      max: null,
      enumValues: null,
      description: 'Arguments bruts',
    },
  ],
  presets: [
    {
      id: 'scan-rapide-top-1000',
      name: 'Scan rapide (top 1000)',
      description: 'Recette : nmap -T4 --top-ports 1000',
      options: { args: '-T4 --top-ports 1000' },
    },
  ],
} as ScannerCatalogEntry;

describe('ScannerOptionsForm — exemples de run (SP2)', () => {
  it('un clic sur un exemple pré-remplit le champ args, éditable ensuite', () => {
    const onChange = vi.fn();
    render(
      <MockedProvider mocks={[kaliUsageMock]}>
        <ScannerOptionsForm entry={kaliEntry} onChange={onChange} />
      </MockedProvider>,
    );

    // Heading relabeled to "Exemples de run".
    expect(screen.getByText('Exemples de run')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Scan rapide/ }));
    expect(JSON.parse(onChange.mock.calls.at(-1)?.[0] as string)).toMatchObject({
      args: '-T4 --top-ports 1000',
    });

    // The value landed in the editable args field and stays editable.
    const argsField = screen.getByLabelText('field-args') as HTMLInputElement;
    expect(argsField.value).toBe('-T4 --top-ports 1000');
    fireEvent.change(argsField, { target: { value: '-A -T4' } });
    expect(JSON.parse(onChange.mock.calls.at(-1)?.[0] as string)).toMatchObject({ args: '-A -T4' });
  });
});
