import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import signToken from "../../Utils/signin-token";
import {
  isValidSriLankanMobile,
  normalizeSriLankanMobile,
} from "../../Utils/phone-validator";
import { cleanPhoneNumber } from "../../Utils/whatsapp-service";

describe("Authentication & Token Unit Tests", () => {
  it("should sign a valid JWT token with the user ID payload", () => {
    const userId = "user-abc-123456";
    const token = signToken(userId);

    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "development-jwt-secret-key-at-least-32-chars-long"
    );
    expect(decoded.id).toBe(userId);
    expect(decoded.exp).toBeDefined();
  });

  it("should hash and verify passwords using bcryptjs", async () => {
    const password = "SuperSecretPassword@2026!";
    const hash = await bcrypt.hash(password, 10);

    expect(hash).not.toBe(password);
    expect(await bcrypt.compare(password, hash)).toBe(true);
    expect(await bcrypt.compare("WrongPassword123!", hash)).toBe(false);
  });

  it("should validate and normalize Sri Lankan mobile numbers", () => {
    // Valid formats
    expect(isValidSriLankanMobile("0771234567")).toBe(true);
    expect(isValidSriLankanMobile("071 234 5678")).toBe(true);
    expect(isValidSriLankanMobile("+94771234567")).toBe(true);
    expect(isValidSriLankanMobile("+94 77 123 4567")).toBe(true);

    // Invalid formats
    expect(isValidSriLankanMobile("12345")).toBe(false);
    expect(isValidSriLankanMobile("0811234567")).toBe(false); // landline
    expect(isValidSriLankanMobile("not-a-number")).toBe(false);

    // Normalization to +947XXXXXXXX
    expect(normalizeSriLankanMobile("0771234567")).toBe("+94771234567");
    expect(normalizeSriLankanMobile("+94 77 123 4567")).toBe("+94771234567");
    expect(cleanPhoneNumber("077 123 4567")).toBe("0771234567");
  });
});
