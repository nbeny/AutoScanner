export default {
  displayName: 'scanners-gcp-bucket-brute',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    '^@autoscanner/(.*)$': '<rootDir>/../../$1/src/index.ts',
  },
  testMatch: ['**/*.spec.ts'],
  coverageDirectory: '../../../coverage/libs/scanners/gcp-bucket-brute',
};
