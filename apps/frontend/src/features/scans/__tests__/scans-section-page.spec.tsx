import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { ScansSectionPage } from '../scans-section-page';

describe('<ScansSectionPage />', () => {
  it('renders the global scope heading when no engagementId', () => {
    render(
      <MemoryRouter>
        <ScansSectionPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('scans-section')).toHaveTextContent('Scans');
    expect(screen.getByLabelText('scope-badge')).toHaveTextContent('Tous les engagements');
  });

  it('renders the engagement scope when engagementId is provided', () => {
    render(
      <MemoryRouter>
        <ScansSectionPage engagementId="eng-1" />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('scope-badge')).toHaveTextContent('eng-1');
  });
});
