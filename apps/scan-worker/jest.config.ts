export default {
  displayName: 'scan-worker',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    // Scanner libs live at libs/scanners/<name> (nested), so map the flat
    // package name @autoscanner/scanners-<name> onto it (covers scanners-all too).
    '^@autoscanner/scanners-(.*)$': '<rootDir>/../../libs/scanners/$1/src/index.ts',
    '^@autoscanner/(.*)$': '<rootDir>/../../libs/$1/src/index.ts',
  },
  testMatch: ['**/*.spec.ts'],
  coverageDirectory: '../../coverage/apps/scan-worker',
};
