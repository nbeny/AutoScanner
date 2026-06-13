import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import { EMAILS_QUERY, ORG_METADATA_QUERY } from '../../../lib/graphql/queries';
import { EngagementOsintTab } from '../engagement-osint-tab';

const engagementId = 'eng_1';

const emailsMock = {
  request: { query: EMAILS_QUERY, variables: { engagementId } },
  result: {
    data: {
      emails: [
        {
          id: 'em_1',
          address: 'alice@example.com',
          source: 'hunter',
          lastSeenAt: '2026-01-01T12:00:00.000Z',
        },
        {
          id: 'em_2',
          address: 'bob@example.com',
          source: 'theHarvester',
          lastSeenAt: '2026-01-02T08:30:00.000Z',
        },
      ],
    },
  },
};

const orgMetaMock = {
  request: { query: ORG_METADATA_QUERY, variables: { engagementId } },
  result: {
    data: {
      orgMetadata: [
        {
          id: 'om_1',
          kind: 'WHOIS',
          source: 'whois',
          data: { registrant: 'Acme Corp', email: 'admin@acme.com' },
          lastSeenAt: '2026-01-03T10:00:00.000Z',
        },
      ],
    },
  },
};

const emptyEmailsMock = {
  request: { query: EMAILS_QUERY, variables: { engagementId } },
  result: { data: { emails: [] } },
};

const emptyOrgMetaMock = {
  request: { query: ORG_METADATA_QUERY, variables: { engagementId } },
  result: { data: { orgMetadata: [] } },
};

function renderTab(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MockedProvider mocks={mocks}>
      <EngagementOsintTab engagementId={engagementId} />
    </MockedProvider>,
  );
}

describe('<EngagementOsintTab />', () => {
  it('renders email addresses after data loads', async () => {
    renderTab([emailsMock, orgMetaMock]);
    expect(await screen.findByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('renders source for each email', async () => {
    renderTab([emailsMock, orgMetaMock]);
    await screen.findByText('alice@example.com');
    expect(screen.getByText('hunter')).toBeInTheDocument();
    expect(screen.getByText('theHarvester')).toBeInTheDocument();
  });

  it('renders org metadata kind and source', async () => {
    renderTab([emailsMock, orgMetaMock]);
    expect(await screen.findByText('WHOIS')).toBeInTheDocument();
    expect(screen.getByText('whois')).toBeInTheDocument();
  });

  it('renders org metadata data as JSON', async () => {
    renderTab([emailsMock, orgMetaMock]);
    await screen.findByText('WHOIS');
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderTab([emailsMock, orgMetaMock]);
    expect(screen.getByText(/loading emails/i)).toBeInTheDocument();
  });

  it('shows empty state when no emails are returned', async () => {
    renderTab([emptyEmailsMock, orgMetaMock]);
    expect(await screen.findByText(/no emails found/i)).toBeInTheDocument();
  });

  it('shows empty state when no org metadata is returned', async () => {
    renderTab([emailsMock, emptyOrgMetaMock]);
    expect(await screen.findByText(/no org metadata found/i)).toBeInTheDocument();
  });
});
