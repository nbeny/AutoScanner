import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AssetProvenanceTab } from '../asset-provenance-tab';

const sample = [
  {
    id: 'o1',
    kind: 'DISCOVERED',
    scannerName: 'subfinder',
    ts: '2026-05-30T10:00:00.000Z',
    payload: null,
  },
  {
    id: 'o2',
    kind: 'PORT_OPEN',
    scannerName: 'naabu',
    ts: '2026-05-30T11:30:00.000Z',
    payload: { number: 443, protocol: 'TCP' },
  },
  {
    id: 'o3',
    kind: 'FINDING_RAISED',
    scannerName: 'nuclei',
    ts: '2026-05-31T09:15:00.000Z',
    payload: { title: 'Outdated Apache', severity: 'HIGH' },
  },
];

describe('AssetProvenanceTab', () => {
  it('renders an empty-state when no observations are present', () => {
    render(<AssetProvenanceTab observations={[]} />);
    expect(screen.getByText(/Aucune observation/i)).toBeInTheDocument();
  });

  it('renders a row per observation with kind, scanner badge, and ts', () => {
    render(<AssetProvenanceTab observations={sample} />);
    expect(screen.getByText('DISCOVERED')).toBeInTheDocument();
    expect(screen.getByText('PORT_OPEN')).toBeInTheDocument();
    expect(screen.getByText('FINDING_RAISED')).toBeInTheDocument();
    expect(screen.getByText('subfinder')).toBeInTheDocument();
    expect(screen.getByText('naabu')).toBeInTheDocument();
    expect(screen.getByText('nuclei')).toBeInTheDocument();
  });

  it('groups observations by day (descending)', () => {
    render(<AssetProvenanceTab observations={sample} />);
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveTextContent('2026-05-31');
    expect(headings[1]).toHaveTextContent('2026-05-30');
  });

  it('does not render Show older button when hasMore is false', () => {
    render(<AssetProvenanceTab observations={sample} hasMore={false} onLoadMore={() => {}} />);
    expect(screen.queryByRole('button', { name: /show older/i })).toBeNull();
  });

  it('renders Show older button and fires onLoadMore when clicked', () => {
    const onLoadMore = vi.fn();
    render(<AssetProvenanceTab observations={sample} hasMore onLoadMore={onLoadMore} />);
    const btn = screen.getByRole('button', { name: /show older/i });
    fireEvent.click(btn);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('disables the button and shows a loading label while fetching more', () => {
    render(<AssetProvenanceTab observations={sample} hasMore loadingMore onLoadMore={() => {}} />);
    const btn = screen.getByRole('button', { name: /chargement/i });
    expect(btn).toBeDisabled();
  });
});
