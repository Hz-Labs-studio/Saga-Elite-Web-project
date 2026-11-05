import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import {
  formatAmount,
  generateCheckoutHash,
  verifyNotifySignature,
  PAYHERE_STATUS,
} from "../../Utils/payhere-service";
import { normalizeReference } from "../../Utils/receipt-ocr";

describe("Payment & PayHere Integration Unit Tests", () => {
  const TEST_MERCHANT_ID = "1223344";
  const TEST_MERCHANT_SECRET = "test_merchant_secret_998877";

  beforeEach(() => {
    process.env.PAYHERE_MERCHANT_ID = TEST_MERCHANT_ID;
    process.env.PAYHERE_MERCHANT_SECRET = TEST_MERCHANT_SECRET;
  });

  describe("formatAmount", () => {
    it("should format numbers to 2 decimal places as required by PayHere", () => {
      expect(formatAmount(100)).toBe("100.00");
      expect(formatAmount(2499.5)).toBe("2499.50");
      expect(formatAmount("150.756")).toBe("150.76");
      expect(formatAmount(0)).toBe("0.00");
    });
  });

  describe("generateCheckoutHash", () => {
    it("should generate a 32-character uppercase MD5 checkout hash", () => {
      const hash = generateCheckoutHash({
        merchantId: TEST_MERCHANT_ID,
        orderId: "ORD-9999",
        amount: 3500,
        currency: "LKR",
      });

      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(32);
      expect(hash).toBe(hash.toUpperCase());
    });
  });

  describe("verifyNotifySignature", () => {
    it("should return true for a valid PayHere callback signature", () => {
      const md5Upper = (val) =>
        crypto.createHash("md5").update(String(val)).digest("hex").toUpperCase();
      const secretHash = md5Upper(TEST_MERCHANT_SECRET);

      const orderId = "ORD-TEST-001";
      const payhereAmount = "5000.00";
      const payhereCurrency = "LKR";
      const statusCode = PAYHERE_STATUS.SUCCESS;

      const validSig = md5Upper(
        `${TEST_MERCHANT_ID}${orderId}${payhereAmount}${payhereCurrency}${statusCode}${secretHash}`
      );

      const isValid = verifyNotifySignature({
        merchantId: TEST_MERCHANT_ID,
        orderId,
        payhereAmount,
        payhereCurrency,
        statusCode,
        receivedSig: validSig,
      });

      expect(isValid).toBe(true);
    });

    it("should return false when the amount has been tampered with", () => {
      const md5Upper = (val) =>
        crypto.createHash("md5").update(String(val)).digest("hex").toUpperCase();
      const secretHash = md5Upper(TEST_MERCHANT_SECRET);

      const orderId = "ORD-TEST-001";
      const genuineAmount = "5000.00";
      const tamperedAmount = "100.00"; // Attacker attempts to pay 100 instead of 5000
      const payhereCurrency = "LKR";
      const statusCode = PAYHERE_STATUS.SUCCESS;

      const sigFor100 = md5Upper(
        `${TEST_MERCHANT_ID}${orderId}${tamperedAmount}${payhereCurrency}${statusCode}${secretHash}`
      );

      const isValid = verifyNotifySignature({
        merchantId: TEST_MERCHANT_ID,
        orderId,
        payhereAmount: genuineAmount,
        payhereCurrency,
        statusCode,
        receivedSig: sigFor100,
      });

      expect(isValid).toBe(false);
    });

    it("should return false when signature is missing or corrupted", () => {
      expect(
        verifyNotifySignature({
          merchantId: TEST_MERCHANT_ID,
          orderId: "ORD-001",
          payhereAmount: "100.00",
          payhereCurrency: "LKR",
          statusCode: "2",
          receivedSig: "",
        })
      ).toBe(false);

      expect(
        verifyNotifySignature({
          merchantId: TEST_MERCHANT_ID,
          orderId: "ORD-001",
          payhereAmount: "100.00",
          payhereCurrency: "LKR",
          statusCode: "2",
          receivedSig: "CORRUPTED_HEX_SIGNATURE",
        })
      ).toBe(false);
    });
  });

  describe("normalizeReference", () => {
    it("should strip non-alphanumeric characters and require SE prefix", () => {
      expect(normalizeReference("se-pay-1234")).toBe("SEPAY1234");
      expect(normalizeReference("SE-2026-99999")).toBe("SE202699999");
      expect(normalizeReference("ord 9876")).toBeNull();
      expect(normalizeReference("")).toBeNull();
    });
  });
});
