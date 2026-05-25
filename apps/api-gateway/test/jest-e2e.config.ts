export default {
  displayName: 'api-gateway-e2e',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.e2e-spec.ts'],
  rootDir: '.',
  setupFiles: ['<rootDir>/setup-env.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.e2e.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@autoscanner/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts',
  },
};
