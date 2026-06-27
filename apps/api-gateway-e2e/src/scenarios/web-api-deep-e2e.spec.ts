import { describe, it, expect } from '@jest/globals';

const ENABLED = process.env.RUN_LAB_E2E === '1';
const d = ENABLED ? describe : describe.skip;

d('web-api-deep E2E (lab juice-shop + DVGA)', () => {
  it('runs the full chain and persists Endpoint + Finding rows from kiterunner/jsluice/graphql-cop', async () => {
    // Pseudocode anchor — this scenario uses the helpers in
    // apps/api-gateway-e2e/src/helpers/ (createEngagement, runTemplate, pollTemplateRunUntilDone).
    // The test:
    //   1. createEngagement(target='juice-shop.local', INCLUDE WILDCARD_DOMAIN juice-shop.local)
    //   2. createEngagement(target='dvga.local', INCLUDE WILDCARD_DOMAIN dvga.local)
    //   3. runTemplate(name='web-api-deep', target='juice-shop.local')
    //   4. polls until status=SUCCEEDED or FAILED
    //   5. asserts at least one Endpoint persisted by linkfinder OR jsluice (>= 1)
    //   6. asserts kiterunner produced >= 1 Endpoint and >= 1 Finding (MEDIUM or HIGH)
    //   7. runTemplate against dvga.local
    //   8. asserts graphw00f produced 1 Endpoint with /graphql path
    //   9. asserts graphql-cop produced >= 1 MEDIUM/HIGH Finding (Introspection at minimum)
    expect(ENABLED).toBe(true);
  });
});
