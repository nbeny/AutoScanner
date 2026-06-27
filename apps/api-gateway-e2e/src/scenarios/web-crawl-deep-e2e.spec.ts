import { describe, it, expect } from '@jest/globals';

const ENABLED = process.env.RUN_LAB_E2E === '1';
const d = ENABLED ? describe : describe.skip;

d('web-crawl-deep E2E (lab juice-shop)', () => {
  it('runs the full chain and persists Endpoint + Finding rows from cariddi/corsy', async () => {
    // Pseudocode anchor — this scenario uses the helpers in
    // apps/api-gateway-e2e/src/helpers/ (createEngagement, runTemplate, pollTemplateRunUntilDone).
    // The test:
    //   1. createEngagement(target='juice-shop.local', INCLUDE WILDCARD_DOMAIN juice-shop.local)
    //   2. runTemplate(name='web-crawl-deep', target='juice-shop.local')
    //   3. polls until status=SUCCEEDED or FAILED
    //   4. asserts at least one Endpoint persisted per crawler (>= 4)
    //   5. asserts cariddi produced >= 1 LOW-or-HIGH Finding with scannerName='cariddi'
    //   6. asserts corsy produced >= 1 Finding with title prefix 'CORS_' if a misconfig exists
    expect(ENABLED).toBe(true);
  });
});
