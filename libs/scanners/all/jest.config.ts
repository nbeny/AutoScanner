export default {
  displayName: 'scanners-all',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    // Scanner libs live at libs/scanners/<name>/ — one level deeper than other
    // @autoscanner libs, so they need a more specific rule (one `../` from
    // libs/scanners/all/) BEFORE the generic two-`../` rule below. Don't copy
    // the generic-only mapper from non-nested libs here.
    '^@autoscanner/scanners-(.*)$': '<rootDir>/../$1/src/index.ts',
    '^@autoscanner/(.*)$': '<rootDir>/../../$1/src/index.ts',
  },
  testMatch: ['**/*.spec.ts'],
  coverageDirectory: '../../../coverage/libs/scanners/all',
};
