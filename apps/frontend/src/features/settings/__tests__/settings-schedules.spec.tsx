import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import { ScopeProvider, type ScopeStorage } from '../../../lib/scope-context';
import { SettingsPage } from '../settings-page';

function scope(initial: string | null): ScopeStorage {
  let v = initial;
  return {
    read: () => v,
    write: (id) => {
      v = id;
    },
    clear: () => {
      v = null;
    },
  };
}

describe('SettingsPage schedules section', () => {
  it('prompts to pick a scope when none is selected', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <ScopeProvider storage={scope(null)}>
          <SettingsPage />
        </ScopeProvider>
      </MockedProvider>,
    );
    expect(screen.getByText('Planification')).toBeInTheDocument();
    expect(screen.getByLabelText('schedules-no-scope')).toBeInTheDocument();
  });
});
