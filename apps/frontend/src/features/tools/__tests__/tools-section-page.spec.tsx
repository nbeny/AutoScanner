import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { ToolsSectionPage } from '../tools-section-page';

describe('<ToolsSectionPage />', () => {
  it('renders the global scope heading when no engagementId', () => {
    render(
      <MemoryRouter>
        <ToolsSectionPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('tools-section')).toHaveTextContent('Outils');
    expect(screen.getByLabelText('scope-badge')).toHaveTextContent('Tous les engagements');
  });

  it('renders the engagement scope when engagementId is provided', () => {
    render(
      <MemoryRouter>
        <ToolsSectionPage engagementId="eng-3" />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('scope-badge')).toHaveTextContent('eng-3');
  });
});
