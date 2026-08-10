import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { ENGAGEMENTS_QUERY } from '../graphql/queries';
import { ScopeProvider, useScope, type ScopeStorage } from '../scope-context';
import { useEnsureScope } from '../use-ensure-scope';

function mem(initial: string | null = null): ScopeStorage {
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

function engagementsMock(engagements: Array<{ id: string; name: string }>) {
  return {
    request: { query: ENGAGEMENTS_QUERY },
    result: {
      data: {
        engagements: engagements.map((e) => ({
          ...e,
          clientName: 'c',
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00.000Z',
        })),
      },
    },
  };
}

// Probe component: mounts the hook and renders the resolved scope so tests can
// assert on the auto-selection side effect.
function Probe() {
  const { engagement } = useEnsureScope();
  const { engagementId } = useScope();
  return <div data-testid="scope">{`${engagementId ?? 'none'}|${engagement?.name ?? 'none'}`}</div>;
}

function renderProbe(mocks: unknown[], storage: ScopeStorage) {
  return render(
    <MockedProvider mocks={mocks as never} addTypename={false}>
      <ScopeProvider storage={storage}>
        <Probe />
      </ScopeProvider>
    </MockedProvider>,
  );
}

describe('useEnsureScope', () => {
  it('auto-selects the sole engagement when none is stored', async () => {
    renderProbe([engagementsMock([{ id: 'e1', name: 'Quick Scans' }])], mem(null));
    await waitFor(() => expect(screen.getByTestId('scope').textContent).toBe('e1|Quick Scans'));
  });

  it('repairs a stale stored id that no longer resolves', async () => {
    renderProbe([engagementsMock([{ id: 'e1', name: 'Quick Scans' }])], mem('ghost-id'));
    await waitFor(() => expect(screen.getByTestId('scope').textContent).toBe('e1|Quick Scans'));
  });

  it('keeps a valid stored id untouched', async () => {
    renderProbe(
      [
        engagementsMock([
          { id: 'e1', name: 'A' },
          { id: 'e2', name: 'B' },
        ]),
      ],
      mem('e2'),
    );
    await waitFor(() => expect(screen.getByTestId('scope').textContent).toBe('e2|B'));
  });
});
