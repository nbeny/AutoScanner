import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import { ALL_SCANS_QUERY } from '../../../lib/graphql/queries';
import { ScansSectionPage } from '../scans-section-page';

const emptyMock = {
  request: { query: ALL_SCANS_QUERY, variables: { filter: {} } },
  result: { data: { allScans: [] } },
};

const emptyMockWithEngagement = {
  request: {
    query: ALL_SCANS_QUERY,
    variables: { filter: { engagementId: 'eng-1' } },
  },
  result: { data: { allScans: [] } },
};

describe('<ScansSectionPage />', () => {
  it('renders the global scope heading when no engagementId', () => {
    render(
      <MockedProvider mocks={[emptyMock]}>
        <MemoryRouter>
          <ScansSectionPage />
        </MemoryRouter>
      </MockedProvider>,
    );
    expect(screen.getByLabelText('scans-section')).toHaveTextContent('Scans');
    expect(screen.getByLabelText('scope-badge')).toHaveTextContent('Tous les engagements');
  });

  it('renders the engagement scope when engagementId is provided', () => {
    render(
      <MockedProvider mocks={[emptyMockWithEngagement]}>
        <MemoryRouter>
          <ScansSectionPage engagementId="eng-1" />
        </MemoryRouter>
      </MockedProvider>,
    );
    expect(screen.getByLabelText('scope-badge')).toHaveTextContent('eng-1');
  });
});
