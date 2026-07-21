import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node environment on purpose: every new service module is designed so its
    // LOGIC is canvas-free (dependency-injected), which keeps the whole test
    // suite runnable headless in CI with zero browser setup. Canvas-touching
    // code (SoM mark rendering, image sampling) is isolated in tiny functions
    // that are exercised by the Playwright e2e layer instead (see PROJECT-BRIEF).
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
