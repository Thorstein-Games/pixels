import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  // A stray test.only must not silently skip the rest of the suite in CI.
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173/pix-pen/",
    // A full trace (DOM snapshots, network, console) of any CI failure, in
    // the uploaded report, so failures can be diagnosed without a rerun.
    trace: process.env.CI ? "retain-on-failure" : "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
    // Safari's engine, where most iPhone-only bugs live. Runs in CI (the
    // Playwright container has WebKit); locally it needs `npx playwright install webkit`.
    { name: "iphone", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/pix-pen/",
    reuseExistingServer: !process.env.CI,
  },
});
