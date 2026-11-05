const path = require("path");
const { defineConfig, devices } = require("@playwright/test");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, ".env.test") });

const REPO_ROOT = path.resolve(__dirname, "..");
const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT || 5001);
const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT || 5173);

const BASE_URL =
  process.env.E2E_BASE_URL || `http://localhost:${FRONTEND_PORT}`;
const BACKEND_URL =
  process.env.E2E_BACKEND_URL || `http://127.0.0.1:${BACKEND_PORT}`;

process.env.E2E_BACKEND_URL = BACKEND_URL;
process.env.E2E_BASE_URL = BASE_URL;

const TEST_DB_URI =
  process.env.MONGODB_TEST_URI || process.env.MONGO_DB_URI || "mongodb://127.0.0.1:27017/saga_elite_test";

const sharedServerEnv = {
  ...process.env,
  NODE_ENV: "test",
  PORT: String(BACKEND_PORT),
  MONGO_DB_URI: TEST_DB_URI,
  E2E_BACKEND_URL: BACKEND_URL,
  E2E_BASE_URL: BASE_URL,
  JWT_SECRET:
    process.env.JWT_SECRET ||
    "test-jwt-secret-must-be-at-least-32-characters-long",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
  RATE_LIMIT_LOGIN_MAX: "1000",
  RATE_LIMIT_AUTH_MAX: "1000",
  RATE_LIMIT_GENERAL_MAX: "10000",
  RATE_LIMIT_CONTACT_MAX: "1000",
  // Disable background jobs and external integrations during tests
  DISABLE_BACKGROUND_JOBS: "true",
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "test-cloud",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "test-key",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "test-secret",
};

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: ["smoke/**/*.spec.js", "features/**/*.spec.js"],
  timeout: process.env.CI ? 90_000 : 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],

  globalSetup: require.resolve("./global-setup.js"),
  globalTeardown: require.resolve("./global-teardown.js"),

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "node Server-side/server.js",
      cwd: REPO_ROOT,
      port: BACKEND_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: sharedServerEnv,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `npm --prefix Client-Side run dev -- --port ${FRONTEND_PORT} --strictPort`,
      cwd: REPO_ROOT,
      port: FRONTEND_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_BACKEND_TARGET: BACKEND_URL,
        VITE_API_URL: "/api",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
