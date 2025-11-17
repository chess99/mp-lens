/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  clearMocks: true,
  // Force Jest to exit after tests complete
  forceExit: true,
  // Detect open handles that prevent Jest from exiting
  detectOpenHandles: true,
  // Global setup and teardown
  globalSetup: '<rootDir>/tests/global-setup.ts',
  globalTeardown: '<rootDir>/tests/global-teardown.ts',
  // Setup files to run before each test file
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Test file patterns for integration tests
  testMatch: ['**/tests/commands/**/*.test.ts', '**/tests/telemetry/**/*.test.ts'],
  // Transform TypeScript files
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Test timeout for integration tests (longer than unit tests)
  testTimeout: 30000,
  // Verbose output for better debugging
  verbose: true,
  globals: {
    'ts-jest': {
      moduleResolution: 'bundler',
    },
  },
};
