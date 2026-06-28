import { z } from 'zod';

export enum CloudProvider {
  AWS = 'AWS',
  AZURE = 'AZURE',
  GCP = 'GCP',
}

export interface LiveCheckResult {
  ok: boolean;
  principal?: string;
  error?: string;
}

export const AwsInputSchema = z.object({
  accessKeyId: z.string().min(16).max(128),
  secretAccessKey: z.string().min(16).max(256),
  sessionToken: z.string().min(16).max(8192).optional(),
  region: z
    .string()
    .regex(/^[a-z]{2}-[a-z]+-\d+$/)
    .optional(),
});
export type AwsInput = z.infer<typeof AwsInputSchema>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AzureInputSchema = z.object({
  tenantId: z.string().regex(UUID_RE),
  clientId: z.string().regex(UUID_RE),
  clientSecret: z.string().min(1).max(2048),
  subscriptionId: z.string().regex(UUID_RE).optional(),
});
export type AzureInput = z.infer<typeof AzureInputSchema>;

const GcpServiceAccountSchema = z.object({
  type: z.literal('service_account'),
  project_id: z.string().min(1),
  private_key: z.string().includes('PRIVATE KEY'),
  client_email: z.string().email(),
});

export const GcpInputSchema = z.object({
  serviceAccountJson: z.string().refine(
    (s) => {
      try {
        GcpServiceAccountSchema.parse(JSON.parse(s));
        return true;
      } catch {
        return false;
      }
    },
    {
      message:
        'serviceAccountJson must be a valid GCP service account JSON with type, project_id, private_key, client_email',
    },
  ),
});
export type GcpInput = z.infer<typeof GcpInputSchema>;
