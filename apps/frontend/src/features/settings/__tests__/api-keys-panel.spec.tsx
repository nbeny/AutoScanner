import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  API_CREDENTIALS_QUERY,
  DELETE_API_CREDENTIAL,
  SET_API_CREDENTIAL,
} from '../../../lib/graphql/queries';
import { ApiKeysPanel } from '../api-keys-panel';

const credentialsMock = {
  request: { query: API_CREDENTIALS_QUERY },
  result: {
    data: {
      apiCredentials: [
        {
          provider: 'SHODAN',
          createdAt: '2026-01-01T10:00:00.000Z',
        },
      ],
    },
  },
};

const emptyCredentialsMock = {
  request: { query: API_CREDENTIALS_QUERY },
  result: { data: { apiCredentials: [] } },
};

function renderPanel(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MockedProvider mocks={mocks}>
      <ApiKeysPanel />
    </MockedProvider>,
  );
}

describe('<ApiKeysPanel />', () => {
  it('renders configured provider after data loads', async () => {
    renderPanel([credentialsMock]);
    expect(await screen.findByText('SHODAN')).toBeInTheDocument();
  });

  it('renders createdAt date for each credential', async () => {
    renderPanel([credentialsMock]);
    await screen.findByText('SHODAN');
    expect(screen.getByText('2026-01-01 10:00:00')).toBeInTheDocument();
  });

  it('never renders a secret value', async () => {
    renderPanel([credentialsMock]);
    await screen.findByText('SHODAN');
    // There should be no input with a visible secret value in the DOM
    const passwordInputs = screen.getAllByLabelText(/key/i);
    for (const input of passwordInputs) {
      expect(input).toHaveAttribute('type', 'password');
      expect((input as HTMLInputElement).value).toBe('');
    }
  });

  it('has a password input for the key', () => {
    renderPanel([credentialsMock]);
    const input = screen.getByPlaceholderText(/paste your api key/i);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('has a provider select with SHODAN and CENSYS options', () => {
    renderPanel([credentialsMock]);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'SHODAN' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'CENSYS' })).toBeInTheDocument();
  });

  it('shows empty state when no credentials are configured', async () => {
    renderPanel([emptyCredentialsMock]);
    expect(await screen.findByText(/no api keys configured/i)).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderPanel([credentialsMock]);
    expect(screen.getByText(/loading credentials/i)).toBeInTheDocument();
  });

  it('save button is disabled when the key input is empty', async () => {
    renderPanel([credentialsMock]);
    await screen.findByText('SHODAN');
    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();
  });

  it('save button enables when key input has a value', async () => {
    renderPanel([credentialsMock]);
    await screen.findByText('SHODAN');
    const input = screen.getByPlaceholderText(/paste your api key/i);
    await userEvent.type(input, 'my-secret-key');
    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).not.toBeDisabled();
  });

  it('clears input and refetches after save mutation succeeds', async () => {
    const saveMock = {
      request: {
        query: SET_API_CREDENTIAL,
        variables: { provider: 'SHODAN', secret: 'my-secret-key' },
      },
      result: { data: { setApiCredential: true } },
    };
    const refetchMock = {
      request: { query: API_CREDENTIALS_QUERY },
      result: {
        data: {
          apiCredentials: [{ provider: 'SHODAN', createdAt: '2026-01-01T10:00:00.000Z' }],
        },
      },
    };
    renderPanel([credentialsMock, saveMock, refetchMock]);
    await screen.findByText('SHODAN');
    const input = screen.getByPlaceholderText(/paste your api key/i);
    await userEvent.type(input, 'my-secret-key');
    const saveButton = screen.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton);
    // input should be cleared after save
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('calls delete mutation when delete button is clicked', async () => {
    const deleteMock = {
      request: {
        query: DELETE_API_CREDENTIAL,
        variables: { provider: 'SHODAN' },
      },
      result: { data: { deleteApiCredential: true } },
    };
    const refetchMock = {
      request: { query: API_CREDENTIALS_QUERY },
      result: { data: { apiCredentials: [] } },
    };
    renderPanel([credentialsMock, deleteMock, refetchMock]);
    await screen.findByText('SHODAN');
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await userEvent.click(deleteButton);
    // After deletion refetch returns empty — verify it shows empty state
    expect(await screen.findByText(/no api keys configured/i)).toBeInTheDocument();
  });
});
