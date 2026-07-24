import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import {
  AWS_CREDENTIAL_QUERY,
  AZURE_CREDENTIAL_QUERY,
  GCP_CREDENTIAL_QUERY,
  DELETE_CLOUD_CREDENTIAL,
  SET_AWS_CREDENTIAL,
  SET_AZURE_CREDENTIAL,
  SET_GCP_CREDENTIAL,
} from '../../lib/graphql/queries';

type CloudProvider = 'AWS' | 'AZURE' | 'GCP';

interface LiveCheckResult {
  ok: boolean;
  principal?: string | null;
  error?: string | null;
}

export function CloudCredentialsPanel(): JSX.Element {
  const [active, setActive] = useState<CloudProvider>('AWS');
  const [lastCheck, setLastCheck] = useState<LiveCheckResult | null>(null);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Cloud credentials</h2>

      <div role="tablist" className="flex gap-2 border-b border-slate-700">
        {(['AWS', 'AZURE', 'GCP'] as const).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={active === p}
            onClick={() => {
              setActive(p);
              setLastCheck(null);
            }}
            className={`px-4 py-2 ${active === p ? 'border-b-2 border-blue-500' : ''}`}
          >
            {p}
          </button>
        ))}
      </div>

      {active === 'AWS' && <AwsForm onResult={setLastCheck} />}
      {active === 'AZURE' && <AzureForm onResult={setLastCheck} />}
      {active === 'GCP' && <GcpForm onResult={setLastCheck} />}

      {lastCheck && (
        <div
          className={`p-3 rounded text-sm ${lastCheck.ok ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}
          role={lastCheck.ok ? 'status' : 'alert'}
        >
          {lastCheck.ok
            ? `Verified as ${lastCheck.principal}`
            : `Live-check failed: ${lastCheck.error}`}
        </div>
      )}

      <StoredPreview provider={active} />
    </div>
  );
}

function AwsForm({ onResult }: { onResult: (r: LiveCheckResult | null) => void }): JSX.Element {
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [region, setRegion] = useState('');
  const [save, { loading }] = useMutation(SET_AWS_CREDENTIAL, {
    refetchQueries: [{ query: AWS_CREDENTIAL_QUERY }],
  });

  async function handle(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const result = await save({
      variables: { input: { accessKeyId, secretAccessKey, sessionToken, region } },
    });
    onResult((result.data?.setAwsCredential ?? null) as LiveCheckResult | null);
  }

  return (
    <form onSubmit={handle} className="space-y-3">
      <Field label="Access Key ID" value={accessKeyId} onChange={setAccessKeyId} type="password" />
      <Field
        label="Secret Access Key"
        value={secretAccessKey}
        onChange={setSecretAccessKey}
        type="password"
      />
      <Field
        label="Session Token (optional)"
        value={sessionToken}
        onChange={setSessionToken}
        type="password"
      />
      <Field label="Region (optional, e.g. eu-west-3)" value={region} onChange={setRegion} />
      <button disabled={loading} className="px-4 py-2 bg-blue-600 rounded">
        Save & verify
      </button>
    </form>
  );
}

function AzureForm({ onResult }: { onResult: (r: LiveCheckResult | null) => void }): JSX.Element {
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [subscriptionId, setSubscriptionId] = useState('');
  const [save, { loading }] = useMutation(SET_AZURE_CREDENTIAL, {
    refetchQueries: [{ query: AZURE_CREDENTIAL_QUERY }],
  });

  async function handle(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const result = await save({
      variables: { input: { tenantId, clientId, clientSecret, subscriptionId } },
    });
    onResult((result.data?.setAzureCredential ?? null) as LiveCheckResult | null);
  }

  return (
    <form onSubmit={handle} className="space-y-3">
      <Field label="Tenant ID" value={tenantId} onChange={setTenantId} />
      <Field label="Client ID" value={clientId} onChange={setClientId} />
      <Field
        label="Client Secret"
        value={clientSecret}
        onChange={setClientSecret}
        type="password"
      />
      <Field
        label="Subscription ID (optional)"
        value={subscriptionId}
        onChange={setSubscriptionId}
      />
      <button disabled={loading} className="px-4 py-2 bg-blue-600 rounded">
        Save & verify
      </button>
    </form>
  );
}

function GcpForm({ onResult }: { onResult: (r: LiveCheckResult | null) => void }): JSX.Element {
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [save, { loading }] = useMutation(SET_GCP_CREDENTIAL, {
    refetchQueries: [{ query: GCP_CREDENTIAL_QUERY }],
  });

  async function handle(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const result = await save({ variables: { input: { serviceAccountJson } } });
    onResult((result.data?.setGcpCredential ?? null) as LiveCheckResult | null);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setServiceAccountJson(reader.result);
    };
    reader.readAsText(file);
  }

  return (
    <form onSubmit={handle} className="space-y-3">
      <label className="block text-sm">
        <span>Service Account JSON</span>
        <textarea
          aria-label="Service Account JSON"
          value={serviceAccountJson}
          onChange={(e) => setServiceAccountJson(e.target.value)}
          className="w-full h-32 p-2 bg-slate-800 font-mono text-xs"
        />
      </label>
      <label className="block text-sm">
        <span>Upload JSON file</span>
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Upload JSON file"
          onChange={handleFile}
        />
      </label>
      <button disabled={loading} className="px-4 py-2 bg-blue-600 rounded">
        Save & verify
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'password';
}): JSX.Element {
  return (
    <label className="block text-sm">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-full p-2 bg-slate-800"
      />
    </label>
  );
}

function StoredPreview({ provider }: { provider: CloudProvider }): JSX.Element {
  const query =
    provider === 'AWS'
      ? AWS_CREDENTIAL_QUERY
      : provider === 'AZURE'
        ? AZURE_CREDENTIAL_QUERY
        : GCP_CREDENTIAL_QUERY;
  const { data } = useQuery(query);
  const [del] = useMutation(DELETE_CLOUD_CREDENTIAL, {
    refetchQueries: [{ query }],
  });

  const credKey =
    provider === 'AWS'
      ? 'awsCredential'
      : provider === 'AZURE'
        ? 'azureCredential'
        : 'gcpCredential';
  const cred = (data as Record<string, { principal?: string; createdAt?: string } | null>)?.[
    credKey
  ];
  if (!cred) return <p className="text-slate-400 text-sm">No credential stored.</p>;
  return (
    <div className="text-sm flex items-center justify-between bg-slate-800/50 p-3 rounded">
      <span>
        Stored: <code className="text-blue-300">{cred.principal}</code>
      </span>
      <button
        onClick={() => del({ variables: { provider } })}
        className="px-3 py-1 bg-red-700 rounded text-xs"
      >
        Delete
      </button>
    </div>
  );
}
