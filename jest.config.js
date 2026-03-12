/** @type {import('jest').Config} */
const config = {
  // 1. Core Settings
  preset: 'ts-jest',
  testEnvironment: 'node',

  // 2. THE FIX FOR UUID:
  // This tells Jest to use the version of uuid that works with Node
  moduleNameMapper: {
    '^uuid$': 'uuid',
  },

  // 3. Transformation settings
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },

  // 4. Your Coverage Settings (Kept from your original file)
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts', 
    '!src/tests/**',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 85,
      lines: 85,
    },
  },
};

module.exports = config;