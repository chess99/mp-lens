/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
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
        // ts-jest configuration options
      },
    ],
  },
  // Test timeout for integration tests (longer than unit tests)
  testTimeout: 30000,
  // Verbose output for better debugging
  verbose: true,
};
