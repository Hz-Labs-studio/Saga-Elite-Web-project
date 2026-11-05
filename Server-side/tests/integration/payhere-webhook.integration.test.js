import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const request = require("supertest");
const crypto = require("crypto");
const app = require("../../app");
const ManualPayment = require("../../Models/ManualPayment");

const md5Upper = (str) => crypto.createHash("md5").update(String(str)).digest("hex").toUpperCase();

describe("PayHere Webhook Integration", () => {
  const originalMerchantId = process.env.PAYHERE_MERCHANT_ID;
  const originalMerchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

  const testMerchantId = "1234567";
  const testMerchantSecret = "test_payhere_secret_xyz123";

  beforeEach(() => {
    delete process.env.PAYHERE_MERCHANT_ID;
    delete process.env.PAYHERE_MERCHANT_SECRET;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.PAYHERE_MERCHANT_ID = originalMerchantId;
    process.env.PAYHERE_MERCHANT_SECRET = originalMerchantSecret;
  });

  it("should return 503 if PayHere is not configured in environment", async () => {
    const res = await request(app)
      .post("/api/webhooks/payhere")
      .type("form")
      .send({
        merchant_id: "1234567",
        order_id: "ORD-9999",
      });

    expect(res.status).toBe(503);
    expect(res.text).toMatch(/PayHere not configured/i);
  });

  it("should reject notify request with 403 when signature is invalid or forged", async () => {
    process.env.PAYHERE_MERCHANT_ID = testMerchantId;
    process.env.PAYHERE_MERCHANT_SECRET = testMerchantSecret;

    const res = await request(app)
      .post("/api/webhooks/payhere")
      .type("form")
      .send({
        merchant_id: testMerchantId,
        order_id: "ORD-1234",
        payment_id: "32001",
        payhere_amount: "5000.00",
        payhere_currency: "LKR",
        status_code: "2",
        md5sig: "FORGED_SIGNATURE_0000000000000000",
      });

    expect(res.status).toBe(403);
    expect(res.text).toMatch(/Invalid signature/i);
  });

  it("should reject notify request with 403 when merchant_id does not match", async () => {
    process.env.PAYHERE_MERCHANT_ID = testMerchantId;
    process.env.PAYHERE_MERCHANT_SECRET = testMerchantSecret;

    const res = await request(app)
      .post("/api/v1/payhere/notify")
      .type("form")
      .send({
        merchant_id: "DIFFERENT_MERCHANT",
        order_id: "ORD-1234",
        payment_id: "32001",
        payhere_amount: "5000.00",
        payhere_currency: "LKR",
        status_code: "2",
        md5sig: "SOME_SIG",
      });

    expect(res.status).toBe(403);
    expect(res.text).toMatch(/Invalid signature/i);
  });

  it("should accept valid signed webhook and acknowledge with 200 OK", async () => {
    process.env.PAYHERE_MERCHANT_ID = testMerchantId;
    process.env.PAYHERE_MERCHANT_SECRET = testMerchantSecret;

    const orderId = "ORD-TEST-4422";
    const payhereAmount = "12500.00";
    const payhereCurrency = "LKR";
    const statusCode = "2";

    const secretHash = md5Upper(testMerchantSecret);
    const validSig = md5Upper(
      `${testMerchantId}${orderId}${payhereAmount}${payhereCurrency}${statusCode}${secretHash}`
    );

    vi.spyOn(ManualPayment, "findOne").mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue(null),
      }),
    });

    const res = await request(app)
      .post("/api/webhooks/payhere")
      .type("form")
      .send({
        merchant_id: testMerchantId,
        order_id: orderId,
        payment_id: "PAY-99988",
        payhere_amount: payhereAmount,
        payhere_currency: payhereCurrency,
        status_code: statusCode,
        md5sig: validSig,
        method: "VISA",
      });

    expect(res.status).toBe(200);
    expect(res.text).toBe("OK");
  });
});
