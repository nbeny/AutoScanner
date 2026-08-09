export default {
  displayName: 'api-gateway',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    // Scanner libs live at libs/scanners/<name>/ — one level deeper than other
    // @autoscanner libs, so they need a more specific rule BEFORE the generic
    // one below (mirrors libs/scanners/all/jest.config.ts).
    '^@autoscanner/scanners-(.*)$': '<rootDir>/../../libs/scanners/$1/src/index.ts',
    '^@autoscanner/(.*)$': '<rootDir>/../../libs/$1/src/index.ts',
  },
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  coverageDirectory: '../../coverage/apps/api-gateway',
};
