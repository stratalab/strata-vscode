import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  outputDir: "../../test-results/visual-artifacts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: {
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 1,
    timezoneId: "UTC",
    locale: "en-US",
  },
});
