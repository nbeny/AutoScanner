import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import {
  AWS_CREDENTIAL_QUERY,
  AZURE_CREDENTIAL_QUERY,
  GCP_CREDENTIAL_QUERY,
  SET_AWS_CREDENTIAL,
} from '../../../lib/graphql/queries';
import { CloudCredentialsPanel } from '../cloud-credentials-panel';

const EMPTY_MOCKS = [
  { request: { query: AWS_CREDENTIAL_QUERY }, result: { data: { awsCredential: null } } },
  { request: { query: AZURE_CREDENTIAL_QUERY }, result: { data: { azureCredential: null } } },
  { request: { query: GCP_CREDENTIAL_QUERY }, result: { data: { gcpCredential: null } } },
];

describe('CloudCredentialsPanel', () => {
  it('renders 3 provider tabs', () => {
    render(
      <MockedProvider mocks={EMPTY_MOCKS} addTypename={false}>
        <CloudCredentialsPanel />
      </MockedProvider>,
    );
    expect(screen.getByRole('tab', { name: /aws/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /azure/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /gcp/i })).toBeInTheDocument();
  });

  it('AWS tab renders 4 input fields', () => {
    render(
      <MockedProvider mocks={EMPTY_MOCKS} addTypename={false}>
        <CloudCredentialsPanel />
      </MockedProvider>,
    );
    fireEvent.click(screen.getByRole('tab', { name: /aws/i }));
    expect(screen.getByLabelText(/access key id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/secret access key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/session token/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/region/i)).toBeInTheDocument();
  });

  it('AWS submit calls setAwsCredential and shows success banner', async () => {
    const mocks = [
      ...EMPTY_MOCKS,
      {
        request: {
          query: SET_AWS_CREDENTIAL,
          variables: {
            input: {
              accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
              secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
              sessionToken: '',
              region: 'eu-west-3',
            },
          },
        },
        result: {
          data: {
            setAwsCredential: {
              ok: true,
              principal: 'arn:aws:iam::111111111111:user/foo',
              error: null,
            },
          },
        },
      },
    ];
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <CloudCredentialsPanel />
      </MockedProvider>,
    );
    fireEvent.click(screen.getByRole('tab', { name: /aws/i }));
    fireEvent.change(screen.getByLabelText(/access key id/i), {
      target: { value: 'AKIAIOSFODNN7EXAMPLE' },
    });
    fireEvent.change(screen.getByLabelText(/secret access key/i), {
      target: { value: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
    });
    fireEvent.change(screen.getByLabelText(/region/i), { target: { value: 'eu-west-3' } });
    fireEvent.click(screen.getByRole('button', { name: /save & verify/i }));
    await waitFor(() => {
      expect(screen.getByText(/arn:aws:iam::111111111111:user\/foo/)).toBeInTheDocument();
    });
  });

  it('GCP tab provides a file upload helper that populates the textarea', async () => {
    render(
      <MockedProvider mocks={EMPTY_MOCKS} addTypename={false}>
        <CloudCredentialsPanel />
      </MockedProvider>,
    );
    fireEvent.click(screen.getByRole('tab', { name: /gcp/i }));
    const fileInput = screen.getByLabelText(/upload json/i) as HTMLInputElement;
    const file = new File(['{"type":"service_account","project_id":"p"}'], 'sa.json', {
      type: 'application/json',
    });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);
    await waitFor(() => {
      const textarea = screen.getByLabelText(/service account json/i) as HTMLTextAreaElement;
      expect(textarea.value).toContain('service_account');
    });
  });
});
