import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test files share one database, so they must not run side by side.
    fileParallelism: false,
  },
});
