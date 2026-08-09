import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { CockpitCommandBar } from '../cockpit-command-bar';
import { SCANNER_CATALOG_QUERY, SCAN_TEMPLATES_QUERY } from '../../../lib/graphql/queries';

const catalog = [
  {
    name: 'nmap',
    displayName: 'nmap',
    description: '',
    categories: ['port-scan'],
    primaryCategory: 'port-scan',
    requiresCredential: null,
    kaliToolRef: null,
    fields: [],
  },
  {
    name: 'shodan',
    displayName: 'shodan',
    description: '',
    categories: ['osint'],
    primaryCategory: 'osint',
    requiresCredential: null,
    kaliToolRef: null,
    fields: [],
  },
];

const mocks = [
  { request: { query: SCANNER_CATALOG_QUERY }, result: { data: { scannerCatalog: catalog } } },
  { request: { query: SCAN_TEMPLATES_QUERY }, result: { data: { scanTemplates: [] } } },
];

describe('CockpitCommandBar (Recon)', () => {
  it('ne propose pas les scanners OSINT', async () => {
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <CockpitCommandBar engagementId="eng-1" pills={[]} />
      </MockedProvider>,
    );
    // Wait for the real catalog-driven <optgroup> to render (the initial
    // render shows a bare placeholder <option> before the query resolves,
    // which would otherwise satisfy a same-named findByRole prematurely).
    await screen.findByRole('group');
    expect(screen.getByRole('option', { name: 'nmap' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'shodan' })).not.toBeInTheDocument();
  });
});
