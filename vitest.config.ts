import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['scripts/scoreCalculator.ts', 'scripts/redflagDetector.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 80,
      },
    },
  },
});
