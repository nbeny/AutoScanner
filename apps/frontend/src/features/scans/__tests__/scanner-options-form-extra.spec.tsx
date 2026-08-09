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
