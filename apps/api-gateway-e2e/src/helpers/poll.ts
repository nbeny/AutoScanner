import type { GraphQLClient } from 'graphql-request';
import type { TemplateRun } from './types';

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED'] as const;

/**
 * Poll `templateRun(id)` every 4s until it reports a terminal status, or
 * throw when `timeoutMs` elapses. The error message includes the last
 * known status + step index so a CI log makes the stuck step obvious
 * without needing to re-run with verbose mode.
 */
export async function pollTemplateRun(
  gql: GraphQLClient,
  id: string,
  timeoutMs: number,
): Promise<TemplateRun> {
  const deadline = Date.now() + timeoutMs;
  let last: TemplateRun | null = null;
  while (Date.now() < deadline) {
    const polled = await gql.request<{ templateRun: TemplateRun | null }>(
      /* GraphQL */ `
        query R($id: ID!) {
          templateRun(id: $id) {
            id
            templateName
            target
            status
            currentStepIndex
            errorMessage
            completedAt
          }
        }
      `,
      { id },
    );
    if (polled.templateRun) {
      last = polled.templateRun;
      if (
        TERMINAL_STATUSES.includes(polled.templateRun.status as (typeof TERMINAL_STATUSES)[number])
      ) {
        return polled.templateRun;
      }
    }
    await sleep(4000);
  }
  throw new Error(
    `templateRun ${id} did not reach a terminal status within ${timeoutMs}ms (last=${
      last?.status ?? 'unknown'
    }, step=${last?.currentStepIndex ?? -1})`,
  );
}
