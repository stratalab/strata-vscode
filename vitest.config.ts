import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    environment: "node",
    // Integration scenarios spawn real hosts; unit tests never get near this.
    testTimeout: 20_000,
  },
});
