export default {
  displayName: 'database',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    '^@autoscanner/(.*)$': '<rootDir>/../$1/src/index.ts',
  },
  testMatch: ['**/*.spec.ts'],
  coverageDirectory: '../../coverage/libs/database',
  // Integration tests run against a shared Postgres dev DB; force serial
  // execution to avoid worker interference (cross-suite data collisions,
  // schema-level locks during reset, etc.).
  maxWorkers: 1,
};
