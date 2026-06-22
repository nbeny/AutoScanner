import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import { ALL_CORRELATED_FINDINGS_QUERY } from '../../../lib/graphql/queries';
import { VulnerabilitiesSectionPage } from '../vulnerabilities-section-page';

const emptyMock = {
  request: { query: ALL_CORRELATED_FINDINGS_QUERY, variables: { filter: {} } },
  result: { data: { allCorrelatedFindings: [] } },
};

const emptyMockWithEngagement = {
  request: {
    query: ALL_CORRELATED_FINDINGS_QUERY,
    variables: { filter: { engagementId: 'eng-9' } },
  },
  result: { data: { allCorrelatedFindings: [] } },
};

describe('<VulnerabilitiesSectionPage />', () => {
  it('renders the global scope heading when no engagementId', () => {
    render(
      <MockedProvider mocks={[emptyMock]}>
        <MemoryRouter>
          <VulnerabilitiesSectionPage />
        </MemoryRouter>
      </MockedProvider>,
    );
    expect(screen.getByLabelText('vulnerabilities-section')).toHaveTextContent('Vulnérabilités');
    expect(screen.getByLabelText('scope-badge')).toHaveTextContent('Tous les engagements');
  });

  it('renders the engagement scope when engagementId is provided', () => {
    render(
      <MockedProvider mocks={[emptyMockWithEngagement]}>
        <MemoryRouter>
          <VulnerabilitiesSectionPage engagementId="eng-9" />
        </MemoryRouter>
      </MockedProvider>,
    );
    expect(screen.getByLabelText('scope-badge')).toHaveTextContent('eng-9');
  });
});
