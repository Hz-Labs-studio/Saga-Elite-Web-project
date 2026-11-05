import { describe, it, expect } from "vitest";
import {
  normalizeMongoUri,
  sanitizeMongoUri,
  validateMongoUri,
  getConnectionStatus,
} from "../../DataBase/db";

describe("Database URI & Connection Helper Unit Tests", () => {
  describe("normalizeMongoUri", () => {
    it("should append default database name if missing on mongodb+srv", () => {
      const uri = "mongodb+srv://cluster.mongodb.net/?retryWrites=true&w=majority";
      const normalized = normalizeMongoUri(uri, "sagaelite");
      expect(normalized).toBe(
        "mongodb+srv://cluster.mongodb.net/sagaelite?retryWrites=true&w=majority"
      );
    });

    it("should preserve custom database name when already specified", () => {
      const uri = "mongodb+srv://cluster.mongodb.net/production_db?retryWrites=true";
      const normalized = normalizeMongoUri(uri, "sagaelite");
      expect(normalized).toBe(
        "mongodb+srv://cluster.mongodb.net/production_db?retryWrites=true"
      );
    });

    it("should append default database name on local mongodb:// connection", () => {
      const uri = "mongodb://127.0.0.1:27017";
      const normalized = normalizeMongoUri(uri, "sagaelite");
      expect(normalized).toBe("mongodb://127.0.0.1:27017/sagaelite");
    });
  });

  describe("sanitizeMongoUri", () => {
    it("should mask username and password credentials cleanly", () => {
      const uri =
        "mongodb+srv://admin_user:SuperSecretPassword123@cluster0.abc.mongodb.net/sagaelite?retryWrites=true";
      const sanitized = sanitizeMongoUri(uri);
      expect(sanitized).toBe(
        "mongodb+srv://***:***@cluster0.abc.mongodb.net/sagaelite?retryWrites=true"
      );
      expect(sanitized).not.toContain("SuperSecretPassword123");
      expect(sanitized).not.toContain("admin_user");
    });

    it("should leave unauthenticated connection strings intact", () => {
      const uri = "mongodb://127.0.0.1:27017/sagaelite";
      expect(sanitizeMongoUri(uri)).toBe(uri);
    });
  });

  describe("validateMongoUri", () => {
    it("should reject empty or non-string values", () => {
      expect(validateMongoUri("").valid).toBe(false);
      expect(validateMongoUri(null).valid).toBe(false);
      expect(validateMongoUri(undefined).valid).toBe(false);
    });

    it("should reject non-mongo protocol URIs", () => {
      expect(validateMongoUri("https://mongodb.com").valid).toBe(false);
      expect(validateMongoUri("postgres://localhost:5432/db").valid).toBe(false);
    });

    it("should reject URIs with unconfigured placeholder tokens", () => {
      const uriWithUserPlaceholder =
        "mongodb+srv://<username>:<password>@cluster.mongodb.net/db";
      const res = validateMongoUri(uriWithUserPlaceholder);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("placeholder tokens");
    });

    it("should accept valid MongoDB connection strings", () => {
      const valid = "mongodb+srv://app_user:secret_pass@cluster.net/sagaelite";
      expect(validateMongoUri(valid).valid).toBe(true);
    });
  });

  describe("getConnectionStatus", () => {
    it("should return readyState and state name structure", () => {
      const status = getConnectionStatus();
      expect(status).toHaveProperty("state");
      expect(status).toHaveProperty("readyState");
      expect(typeof status.readyState).toBe("number");
    });
  });
});
