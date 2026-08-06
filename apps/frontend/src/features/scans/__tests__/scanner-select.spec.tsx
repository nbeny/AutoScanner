import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScannerSelect } from '../scanner-select';
import type { ScannerCatalogEntry } from '../scanner-catalog';

const entry = (name: string, category: string): ScannerCatalogEntry => ({
  name,
  displayName: name,
  description: `${name} scanner`,
  categories: [category],
  requiresCredential: null,
  fields: [],
});

const ENTRIES: ScannerCatalogEntry[] = [
  entry('nmap', 'port-scan'),
  entry('masscan', 'port-scan'),
  entry('nuclei', 'vuln-scan'),
];

describe('<ScannerSelect />', () => {
  it('renders the search box and the current value', () => {
    render(<ScannerSelect entries={ENTRIES} value="nmap" onChange={() => undefined} />);
    expect(screen.getByLabelText('scanner-select')).toBeInTheDocument();
    expect(screen.getByLabelText('scanner-search')).toBeInTheDocument();
  });
  it('filters the list by search text', () => {
    render(<ScannerSelect entries={ENTRIES} value="nmap" onChange={() => undefined} />);
    fireEvent.change(screen.getByLabelText('scanner-search'), { target: { value: 'nucl' } });
    expect(screen.getByRole('button', { name: 'nuclei' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'masscan' })).toBeNull();
  });
  it('calls onChange when a scanner is picked', () => {
    const onChange = vi.fn();
    render(<ScannerSelect entries={ENTRIES} value="nmap" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('scanner-search'), { target: { value: 'nuclei' } });
    fireEvent.click(screen.getByRole('button', { name: 'nuclei' }));
    expect(onChange).toHaveBeenCalledWith('nuclei');
  });
});
