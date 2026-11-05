import { describe, it, expect } from "vitest";
const request = require("supertest");
const app = require("../../app");

describe("Rate Limiting Middleware Integration", () => {
  it("should include standard RateLimit headers on rate-limited endpoints", async () => {
    // Auth routes have authLimiter applied
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "rate-test@example.com", password: "password123" });

    // Header casing in supertest is lowercase
    expect(res.headers).toHaveProperty("ratelimit-limit");
    expect(res.headers).toHaveProperty("ratelimit-remaining");
    expect(res.headers).toHaveProperty("ratelimit-reset");

    const limit = Number(res.headers["ratelimit-limit"]);
    expect(limit).toBeGreaterThan(0);
  });
});

