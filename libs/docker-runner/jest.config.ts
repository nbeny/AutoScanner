export default {
  displayName: 'docker-runner',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    '^@autoscanner/(.*)$': '<rootDir>/../$1/src/index.ts',
  },
  testMatch: ['**/*.spec.ts'],
  coverageDirectory: '../../coverage/libs/docker-runner',
};
