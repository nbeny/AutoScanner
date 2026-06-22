import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { TOOL_ACTIVITY_QUERY, COVERAGE_MATRIX_QUERY } from '../../../lib/graphql/queries';
import { ToolsSectionPage } from '../tools-section-page';

const emptyMock = {
  request: { query: TOOL_ACTIVITY_QUERY, variables: { engagementId: null } },
  result: { data: { toolActivity: [] } },
};

const coverageEmptyMock = {
  request: { query: COVERAGE_MATRIX_QUERY, variables: { engagementId: null } },
  result: { data: { coverageMatrix: [] } },
};

const engMock = {
  request: { query: TOOL_ACTIVITY_QUERY, variables: { engagementId: 'eng-3' } },
  result: { data: { toolActivity: [] } },
};

const coverageEngMock = {
  request: { query: COVERAGE_MATRIX_QUERY, variables: { engagementId: 'eng-3' } },
  result: { data: { coverageMatrix: [] } },
};

describe('<ToolsSectionPage />', () => {
  it('renders the global scope heading when no engagementId', () => {
    render(
      <MockedProvider mocks={[emptyMock, coverageEmptyMock]}>
        <MemoryRouter>
          <ToolsSectionPage />
        </MemoryRouter>
      </MockedProvider>,
    );
    expect(screen.getByLabelText('tools-section')).toHaveTextContent('Outils');
    expect(screen.getByLabelText('scope-badge')).toHaveTextContent('Tous les engagements');
  });

  it('renders the engagement scope when engagementId is provided', () => {
    render(
      <MockedProvider mocks={[engMock, coverageEngMock]}>
        <MemoryRouter>
          <ToolsSectionPage engagementId="eng-3" />
        </MemoryRouter>
      </MockedProvider>,
    );
    expect(screen.getByLabelText('scope-badge')).toHaveTextContent('eng-3');
  });
});
