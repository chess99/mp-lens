/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest', // Use the ts-jest preset
  testEnvironment: 'node', // Specify the test environment
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // Specify the root directory Jest should scan for tests and modules
  // roots: ['<rootDir>/tests'], // Optional: Adjust if tests are only in /tests
  // The glob patterns Jest uses to detect test files
  testMatch: [
    '**/tests/**/*.test.ts', // Look for .test.ts files within the tests directory
    // '**/src/**/*.test.ts' // Optionally include tests within src
  ],
  // A map from regular expressions to paths to transformers
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // ts-jest configuration options go here
        // Example: specify tsconfig if not standardly named or located
        // tsconfig: 'tsconfig.test.json'
      },
    ],
  },
  // Optional: module name mapper for aliases (if needed and not handled by tsconfig paths)
  // moduleNameMapper: {
  //   '^@/(.*)$': '<rootDir>/src/$1'
  // },
  // Optional: setup files to run before each test file
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
