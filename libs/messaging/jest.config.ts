export default {
  displayName: 'messaging',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    '^@autoscanner/(.*)$': '<rootDir>/../$1/src/index.ts',
  },
  testMatch: ['**/*.spec.ts'],
  // Broker-dependent integration tests (*.int.spec.ts) are excluded from the default
  // run so CI/offline stays green; run them via `pnpm test:messaging:int` (needs pnpm dev:up).
  testPathIgnorePatterns: ['/node_modules/', '\\.int\\.spec\\.ts$'],
  coverageDirectory: '../../coverage/libs/messaging',
};
