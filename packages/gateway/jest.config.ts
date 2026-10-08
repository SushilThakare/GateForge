/**
 * @file packages/gateway/jest.config.ts
 * @description Jest configuration for the GateForge Gateway test suite.
 * Configured to run TypeScript integration tests against a live Redis instance.
 *
 * Architecture Context:
 * Fits into the gateway service testing infrastructure. Employs ts-jest to compile
 * TypeScript test specifications in-memory and maps ESM relative `.js` import specifiers
 * back to `.ts` source files without requiring pre-compilation build steps.
 */

import type { Config } from 'jest';

const config: Config = {
  // Use ts-jest preset to process TypeScript files directly
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Match test files inside packages/gateway/tests/
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
  ],

  // Transform TypeScript files with ts-jest
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },

  // Map .js extensions in relative imports to source files (needed for NodeNext module resolution)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // Timeout allowance for integration tests communicating with live Redis over loopback TCP
  testTimeout: 15000,

  // Force verbose reporter output for clear visibility into each rate-limiting test case
  verbose: true,
};

export default config;
