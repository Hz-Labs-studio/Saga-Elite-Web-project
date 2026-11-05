import { describe, it, expect } from "vitest";
import { isAdminRole, isSuperAdmin } from "../../Utils/admin-roles";
import {
  normalizeOrigin,
  isLocalDevOrigin,
  isVercelOrigin,
} from "../../Config/cors-config";
import { getMaxRequests } from "../../Middlewares/rateLimitinMiddleware";

describe("Security & RBAC Unit Tests", () => {
  describe("Admin Roles & Permissions", () => {
    it("should recognize all valid administrator roles", () => {
      expect(isAdminRole("superadmin")).toBe(true);
      expect(isAdminRole("super_admin")).toBe(true);
      expect(isAdminRole("admin")).toBe(true);
      expect(isAdminRole("sub_admin")).toBe(true);
    });

    it("should reject regular customer and user roles from admin access", () => {
      expect(isAdminRole("customer")).toBe(false);
      expect(isAdminRole("user")).toBe(false);
      expect(isAdminRole("guest")).toBe(false);
      expect(isAdminRole("")).toBe(false);
      expect(isAdminRole(null)).toBe(false);
    });

    it("should recognize super admin roles specifically", () => {
      expect(isSuperAdmin("super_admin")).toBe(true);
      expect(isSuperAdmin("superadmin")).toBe(true);
      expect(isSuperAdmin("admin")).toBe(false);
      expect(isSuperAdmin("sub_admin")).toBe(false);
      expect(isSuperAdmin("customer")).toBe(false);
    });
  });

  describe("CORS Security Helpers", () => {
    it("should normalize origins by trimming slashes and converting to lowercase", () => {
      expect(normalizeOrigin("https://SagaElite.lk/")).toBe("https://sagaelite.lk");
      expect(normalizeOrigin("  http://localhost:5173///  ")).toBe("http://localhost:5173");
    });

    it("should identify local development origins", () => {
      expect(isLocalDevOrigin("http://localhost:5173")).toBe(true);
      expect(isLocalDevOrigin("http://127.0.0.1:3000")).toBe(true);
      expect(isLocalDevOrigin("https://evil-attacker.com")).toBe(false);
    });

    it("should validate trusted Vercel preview origins", () => {
      expect(isVercelOrigin("https://saga-elite-web-project.vercel.app")).toBe(true);
      expect(
        isVercelOrigin(
          "https://saga-elite-web-project-git-fix-phase-02-hz-labs-studio.vercel.app"
        )
      ).toBe(true);
      expect(isVercelOrigin("https://unrelated-project.vercel.app")).toBe(false);
      expect(isVercelOrigin("https://malicious.com")).toBe(false);
    });
  });
});
