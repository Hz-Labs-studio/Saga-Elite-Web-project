import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const request = require("supertest");
const app = require("../../app");
const cleanupModule = require("../../Utils/manual-payment-cleanup");

describe("Vercel Cron & Scheduled Jobs Integration", () => {
  const testCronSecret = "test-cron-secret-token-5511";

  beforeEach(() => {
    process.env.ENFORCE_CRON_AUTH = "true";
    process.env.CRON_SECRET = testCronSecret;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.ENFORCE_CRON_AUTH;
    delete process.env.CRON_SECRET;
  });

  it("should reject request to /api/v1/cron/* without authorization with 401", async () => {
    const res = await request(app).get("/api/v1/cron/cleanup-expired-payments");

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("success", false);
    expect(res.body.message).toMatch(/Unauthorized/i);
  });

  it("should reject request with invalid Bearer token with 401", async () => {
    const res = await request(app)
      .get("/api/v1/cron/cleanup-expired-payments")
      .set("Authorization", "Bearer invalid-wrong-secret");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should execute cleanup-expired-payments with valid CRON_SECRET", async () => {
    vi.spyOn(cleanupModule, "markExpiredManualPayments").mockResolvedValue(0);
    vi.spyOn(cleanupModule, "markExpiredCardOrders").mockResolvedValue(0);

    const res = await request(app)
      .post("/api/v1/cron/cleanup-expired-payments")
      .set("Authorization", `Bearer ${testCronSecret}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
    expect(res.body.job).toBe("cleanup-expired-payments");
    expect(res.body.result).toEqual({
      expiredPaymentsCount: 0,
      expiredCardOrdersCount: 0,
    });
  });

  it("should accept request with x-vercel-cron header", async () => {
    vi.spyOn(cleanupModule, "markExpiredManualPayments").mockResolvedValue(0);
    vi.spyOn(cleanupModule, "markExpiredCardOrders").mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/cron/cleanup-expired-payments")
      .set("x-vercel-cron", "1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.job).toBe("cleanup-expired-payments");
  });
});
