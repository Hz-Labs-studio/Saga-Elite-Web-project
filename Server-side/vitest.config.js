const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.js"],
    setupFiles: ["tests/setup.js"],
    testTimeout: 10000,
  },
});
