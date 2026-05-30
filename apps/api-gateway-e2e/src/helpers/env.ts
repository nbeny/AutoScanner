/**
 * Centralised env-reading for the opt-in e2e suites. Every spec needs the
 * same three credentials (api url + operator login) and skips its
 * `describe` block when any of them is missing. Co-locating the lookups
 * here keeps the boilerplate out of the specs and ensures all suites use
 * an identical skip condition.
 */

export interface E2EBaseEnv {
  apiUrl: string | undefined;
  email: string | undefined;
  password: string | undefined;
}

export function readBaseEnv(): E2EBaseEnv {
  return {
    apiUrl: process.env['E2E_API_URL'],
    email: process.env['E2E_EMAIL'],
    password: process.env['E2E_PASSWORD'],
  };
}

/**
 * Returns Jest's `describe` when all base credentials are set, or
 * `describe.skip` otherwise. Use this at the top of each spec so the
 * suite quietly opts out in environments where the full stack isn't up.
 */
export function describeOrSkipE2E(env: E2EBaseEnv = readBaseEnv()): jest.Describe {
  return env.apiUrl && env.email && env.password ? describe : describe.skip;
}
