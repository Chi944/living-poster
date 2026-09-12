import { defineConfig } from "@playwright/test";

const remoteUrl = process.env.HOSTED_BASE_URL;
export default defineConfig({
  testDir: "./tests/hosted-e2e",
  timeout: 45_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: remoteUrl || "http://127.0.0.1:4330",
    viewport: { width: 1512, height: 982 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: remoteUrl
    ? undefined
    : {
        command:
          "npx vite preview --outDir ../../dist/hosted --host 127.0.0.1 --port 4330 --strictPort",
        url: "http://127.0.0.1:4330",
        reuseExistingServer: false,
        timeout: 30_000,
      },
});
