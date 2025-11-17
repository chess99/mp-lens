/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // Force Jest to exit after tests complete
  forceExit: true,
  // Detect open handles that prevent Jest from exiting
  detectOpenHandles: true,
  // Specify the root directory Jest should scan for tests and modules
  // roots: ['<rootDir>/tests'], // Optional: Adjust if tests are only in /tests
  // The glob patterns Jest uses to detect test files
  testMatch: [
    '**/tests/**/*.test.ts', // Look for .test.ts files within the tests directory
    // '**/src/**/*.test.ts' // Optionally include tests within src
  ],
  // Exclude integration test directories
  testPathIgnorePatterns: ['/node_modules/', '/tests/commands/', '/tests/telemetry/'],
  // A map from regular expressions to paths to transformers
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
  // Optional: module name mapper for aliases (if needed and not handled by tsconfig paths)
  // moduleNameMapper: {
  //   '^@/(.*)$': '<rootDir>/src/$1'
  // },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  globals: {
    'ts-jest': {
      moduleResolution: 'bundler',
    },
  },
};
