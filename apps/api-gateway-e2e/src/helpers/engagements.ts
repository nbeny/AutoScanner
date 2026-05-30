import type { GraphQLClient } from 'graphql-request';
import type { Engagement, ScopeRule } from './types';

export interface CreateEngagementInput {
  name: string;
  clientName: string;
}

export async function createEngagement(
  gql: GraphQLClient,
  input: CreateEngagementInput,
): Promise<Engagement> {
  const res = await gql.request<{ createEngagement: Engagement }>(
    /* GraphQL */ `
      mutation Create($input: CreateEngagementInput!) {
        createEngagement(input: $input) {
          id
          name
          status
        }
      }
    `,
    { input },
  );
  return res.createEngagement;
}

export interface CreateScopeRuleInput {
  engagementId: string;
  ruleType: 'INCLUDE' | 'EXCLUDE';
  targetType: string;
  value: string;
}

export async function createScopeRule(
  gql: GraphQLClient,
  input: CreateScopeRuleInput,
): Promise<ScopeRule> {
  const res = await gql.request<{ createScopeRule: ScopeRule }>(
    /* GraphQL */ `
      mutation Scope($input: CreateScopeRuleInput!) {
        createScopeRule(input: $input) {
          id
          engagementId
          ruleType
          targetType
          value
        }
      }
    `,
    { input },
  );
  return res.createScopeRule;
}

/**
 * Convenience: create a fresh engagement + the `INCLUDE WILDCARD_DOMAIN`
 * scope rule that every template-driven scenario needs. Returns the
 * engagement id so the caller can immediately runTemplate against it.
 */
export async function createEngagementWithWildcardScope(
  gql: GraphQLClient,
  opts: { namePrefix: string; clientName: string; target: string },
): Promise<{ engagementId: string; scopeRuleId: string }> {
  const engagement = await createEngagement(gql, {
    name: `${opts.namePrefix}-${Date.now()}`,
    clientName: opts.clientName,
  });
  const rule = await createScopeRule(gql, {
    engagementId: engagement.id,
    ruleType: 'INCLUDE',
    targetType: 'WILDCARD_DOMAIN',
    value: opts.target,
  });
  return { engagementId: engagement.id, scopeRuleId: rule.id };
}
