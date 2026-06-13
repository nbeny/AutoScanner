import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import { TLS_CERTIFICATES_QUERY } from '../../../lib/graphql/queries';
import { EngagementTlsTab } from '../engagement-tls-tab';

const engagementId = 'eng_1';

// Use distinct host vs subjectCn values so findByText stays unambiguous
const flaggedCert = {
  id: 'tls_1',
  host: 'flagged.example.com',
  subjectCn: 'CN=flagged',
  issuerCn: 'Self-Signed CA',
  notAfter: '2020-01-01T00:00:00.000Z',
  tlsVersion: 'TLSv1.2',
  selfSigned: true,
  expired: true,
  source: 'tlsscan',
  lastSeenAt: '2026-01-10T09:00:00.000Z',
};

const cleanCert = {
  id: 'tls_2',
  host: 'secure.example.com',
  subjectCn: 'CN=secure',
  issuerCn: "Let's Encrypt",
  notAfter: '2027-06-01T00:00:00.000Z',
  tlsVersion: 'TLSv1.3',
  selfSigned: false,
  expired: false,
  source: 'tlsscan',
  lastSeenAt: '2026-01-10T09:00:00.000Z',
};

const certsMock = {
  request: { query: TLS_CERTIFICATES_QUERY, variables: { engagementId } },
  result: {
    data: {
      tlsCertificates: [flaggedCert, cleanCert],
    },
  },
};

const emptyCertsMock = {
  request: { query: TLS_CERTIFICATES_QUERY, variables: { engagementId } },
  result: { data: { tlsCertificates: [] } },
};

function renderTab(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MockedProvider mocks={mocks}>
      <EngagementTlsTab engagementId={engagementId} />
    </MockedProvider>,
  );
}

describe('<EngagementTlsTab />', () => {
  it('renders host names after data loads', async () => {
    renderTab([certsMock]);
    expect(await screen.findByText('flagged.example.com')).toBeInTheDocument();
    expect(screen.getByText('secure.example.com')).toBeInTheDocument();
  });

  it('renders the TLS version for each cert', async () => {
    renderTab([certsMock]);
    await screen.findByText('flagged.example.com');
    expect(screen.getByText('TLSv1.2')).toBeInTheDocument();
    expect(screen.getByText('TLSv1.3')).toBeInTheDocument();
  });

  it('shows self-signed badge only for the flagged cert', async () => {
    renderTab([certsMock]);
    await screen.findByText('flagged.example.com');
    const badges = screen.getAllByText('self-signed');
    expect(badges).toHaveLength(1);
  });

  it('shows expired badge only for the flagged cert', async () => {
    renderTab([certsMock]);
    await screen.findByText('flagged.example.com');
    const badges = screen.getAllByText('expired');
    expect(badges).toHaveLength(1);
  });

  it('does not render self-signed or expired badges for the clean cert', async () => {
    renderTab([certsMock]);
    await screen.findByText('secure.example.com');
    // Exactly one of each badge total — clean cert contributes none
    expect(screen.getAllByText('self-signed')).toHaveLength(1);
    expect(screen.getAllByText('expired')).toHaveLength(1);
  });

  it('shows loading state initially', () => {
    renderTab([certsMock]);
    expect(screen.getByText(/loading tls certificates/i)).toBeInTheDocument();
  });

  it('shows empty state when no certificates are returned', async () => {
    renderTab([emptyCertsMock]);
    expect(await screen.findByText(/no tls certificates found/i)).toBeInTheDocument();
  });
});
