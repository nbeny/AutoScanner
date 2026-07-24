export default {
  displayName: 'ai-orchestrator-worker',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    '^@autoscanner/scanners-nmap$': '<rootDir>/../../libs/scanners/nmap/src/index.ts',
    '^@autoscanner/scanners-subfinder$': '<rootDir>/../../libs/scanners/subfinder/src/index.ts',
    '^@autoscanner/scanners-httpx$': '<rootDir>/../../libs/scanners/httpx/src/index.ts',
    '^@autoscanner/scanners-dnsx$': '<rootDir>/../../libs/scanners/dnsx/src/index.ts',
    '^@autoscanner/scanners-naabu$': '<rootDir>/../../libs/scanners/naabu/src/index.ts',
    '^@autoscanner/scanners-nuclei$': '<rootDir>/../../libs/scanners/nuclei/src/index.ts',
    '^@autoscanner/scanners-pwncat$': '<rootDir>/../../libs/scanners/pwncat/src/index.ts',
    '^@autoscanner/(.*)$': '<rootDir>/../../libs/$1/src/index.ts',
  },
  testMatch: ['**/*.spec.ts'],
  coverageDirectory: '../../coverage/apps/ai-orchestrator-worker',
};
