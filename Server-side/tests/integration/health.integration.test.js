import { describe, it, expect } from "vitest";
const request = require("supertest");
const app = require("../../app");

describe("Health Check API Integration", () => {
  it("GET /health should return 200 OK with correct schema", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toHaveProperty("status", "ok");
    expect(res.body).toHaveProperty("uptime");
    expect(typeof res.body.uptime).toBe("number");
    expect(res.body).toHaveProperty("database");
    expect(res.body).toHaveProperty("timestamp");
  });

  it("GET /health should respond in under 200ms without buffering", async () => {
    const start = Date.now();
    const res = await request(app).get("/health");
    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    expect(duration).toBeLessThan(200);
  });
});

