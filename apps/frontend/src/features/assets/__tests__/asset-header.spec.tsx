import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AssetHeader } from '../asset-header';

const base = {
  kind: 'SUBDOMAIN',
  canonicalValue: 'api.example.com',
  riskScore: 12,
  firstSeenAt: '2026-05-01T00:00:00Z',
  lastSeenAt: '2026-05-02T00:00:00Z',
  scannerSources: ['subfinder'],
};

describe('AssetHeader', () => {
  it('does not render the soft-delete banner for an active asset', () => {
    render(<AssetHeader {...base} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders a read-only banner with the deletion date when deletedAt is set (spec §4.5)', () => {
    render(<AssetHeader {...base} deletedAt="2026-06-01T12:34:56Z" />);
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toMatch(/Supprimé le 2026-06-01/);
    expect(banner.textContent).toMatch(/lecture seule/);
  });
});
