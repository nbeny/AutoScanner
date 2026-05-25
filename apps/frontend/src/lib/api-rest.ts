export interface RestAuthPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class RestApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'RestApiError';
  }
}

export async function restLogin(
  apiUrl: string,
  email: string,
  password: string,
): Promise<RestAuthPayload> {
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new RestApiError(res.status, text || `HTTP ${res.status}`);
  }
  return (await res.json()) as RestAuthPayload;
}

export function rawOutputUrl(apiUrl: string, scanJobId: string): string {
  return `${apiUrl}/scan-jobs/${scanJobId}/raw`;
}
