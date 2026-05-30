import { GraphQLClient } from 'graphql-request';
import type { AuthPayload } from './types';

/**
 * Exchange operator credentials for a JWT pair via the REST auth surface.
 * The api-gateway only accepts username/password through the REST handler;
 * GraphQL is bearer-token-gated, so every e2e starts with this round trip.
 */
export async function restLogin(
  apiUrl: string,
  email: string,
  password: string,
): Promise<AuthPayload> {
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as AuthPayload;
}

/** Build a GraphQLClient bound to `${apiUrl}/graphql` with a bearer token. */
export function authedGqlClient(apiUrl: string, accessToken: string): GraphQLClient {
  return new GraphQLClient(`${apiUrl}/graphql`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}
