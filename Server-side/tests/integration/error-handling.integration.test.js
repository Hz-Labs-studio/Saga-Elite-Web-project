import { describe, it, expect } from "vitest";
const request = require("supertest");
const app = require("../../app");

describe("Error Handling Integration", () => {
  it("GET /api/v1/nonexistent-route should return 404 with structured JSON error", async () => {
    const res = await request(app).get("/api/v1/nonexistent-route");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toHaveProperty("status", "fail");
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toMatch(/Can't find \/api\/v1\/nonexistent-route/i);
  });

  it("POST to invalid endpoint should return 404", async () => {
    const res = await request(app)
      .post("/api/unknown/service")
      .send({ data: "test" });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe("fail");
  });

  it("GET /health with trailing slash or query params should still return 200", async () => {
    const res = await request(app).get("/health?probe=ready");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

