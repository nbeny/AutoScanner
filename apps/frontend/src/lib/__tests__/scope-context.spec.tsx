import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScopeProvider, useScope, type ScopeStorage } from '../scope-context';

function makeMemoryStorage(initial: string | null = null): ScopeStorage {
  let value = initial;
  return {
    read: () => value,
    write: (id) => {
      value = id;
    },
    clear: () => {
      value = null;
    },
  };
}

function Probe() {
  const { engagementId, setScope } = useScope();
  return (
    <div>
      <span data-testid="value">{engagementId ?? 'none'}</span>
      <button onClick={() => setScope('eng-2')}>switch</button>
    </div>
  );
}

describe('ScopeProvider', () => {
  it('exposes the initial scope read from storage', () => {
    render(
      <ScopeProvider storage={makeMemoryStorage('eng-1')}>
        <Probe />
      </ScopeProvider>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('eng-1');
  });

  it('writes to storage and updates when setScope is called', () => {
    const storage = makeMemoryStorage(null);
    render(
      <ScopeProvider storage={storage}>
        <Probe />
      </ScopeProvider>,
    );
    fireEvent.click(screen.getByText('switch'));
    expect(screen.getByTestId('value')).toHaveTextContent('eng-2');
    expect(storage.read()).toBe('eng-2');
  });
});
