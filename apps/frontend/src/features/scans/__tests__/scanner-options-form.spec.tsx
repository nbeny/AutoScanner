import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ScannerOptionsForm } from '../scanner-options-form';
import type { ScannerCatalogEntry } from '../scanner-catalog';

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
    render(<ScannerOptionsForm entry={nmapLike} onChange={onChange} />);
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
    render(<ScannerOptionsForm entry={nmapLike} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('field-timingTemplate'), { target: { value: '2' } });
    await waitFor(() => expect(lastEmitted(onChange)).toMatchObject({ timingTemplate: 2 }));
  });

  it('omits an optional field until its toggle is enabled', async () => {
    const onChange = vi.fn();
    render(<ScannerOptionsForm entry={nucleiLike} onChange={onChange} />);
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
    render(<ScannerOptionsForm entry={shodan} onChange={onChange} />);
    expect(screen.getByLabelText('no-options')).toBeInTheDocument();
    expect(screen.getByText(/SHODAN/)).toBeInTheDocument();
  });
});
