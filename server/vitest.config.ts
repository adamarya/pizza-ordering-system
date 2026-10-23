import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The API tests reset the shared test database, so test files run one at a time.
    fileParallelism: false,
  },
});
