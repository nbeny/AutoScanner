import base from './jest.config';

// Broker-dependent integration tests only. Requires `pnpm dev:up` (Redpanda).
export default {
  ...base,
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/*.int.spec.ts'],
};
