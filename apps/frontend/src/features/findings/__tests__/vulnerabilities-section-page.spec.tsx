import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { VulnerabilitiesSectionPage } from '../vulnerabilities-section-page';

describe('<VulnerabilitiesSectionPage />', () => {
  it('renders the global scope heading when no engagementId', () => {
    render(
      <MemoryRouter>
        <VulnerabilitiesSectionPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('vulnerabilities-section')).toHaveTextContent('Vulnérabilités');
    expect(screen.getByLabelText('scope-badge')).toHaveTextContent('Tous les engagements');
  });

  it('renders the engagement scope when engagementId is provided', () => {
    render(
      <MemoryRouter>
        <VulnerabilitiesSectionPage engagementId="eng-9" />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('scope-badge')).toHaveTextContent('eng-9');
  });
});
