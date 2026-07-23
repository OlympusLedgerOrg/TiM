import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  clearMocks: true,
  maxWorkers: 1, // Tests share the Express application and database fixtures.
  testTimeout: 15_000,
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/**/*.d.ts',
    '!<rootDir>/src/prisma/client.ts', // Prisma connection composition; exercised by migration checks.
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'json-summary', 'lcov', 'cobertura'],
  coverageThreshold: {
    global: {
      statements: 75,
      lines: 75,
    },
    './src/services/fieldServiceService.ts': {
      statements: 75,
      lines: 75,
    },
    './src/services/fieldServiceRules.ts': {
      statements: 75,
      lines: 75,
    },
    './src/middleware/integrationAuth.ts': {
      statements: 75,
      lines: 75,
    },
  },
};

export default config;
