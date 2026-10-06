import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text-summary', 'html', 'lcov'],
      // Floor set just below the measured baseline; raise it as coverage improves, never lower it.
      thresholds: {
        statements: 70,
        branches: 69,
        functions: 69,
        lines: 73,
      },
    },
  },
});
