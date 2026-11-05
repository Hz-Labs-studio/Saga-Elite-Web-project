import { describe, it, expect, vi, beforeEach } from "vitest";
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../app");
const User = require("../../Models/User");

describe("Admin & RBAC Guard Integration", () => {
  const secret = process.env.JWT_SECRET || "development-jwt-secret-key-at-least-32-chars-long";
  const dummyUserId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should reject unauthenticated request to /api/v1/admin/search with 401", async () => {
    const res = await request(app).get("/api/v1/admin/search");

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
  });

  it("should reject regular customer (role: customer) with 403 Forbidden", async () => {
    const token = jwt.sign({ id: dummyUserId }, secret, { expiresIn: "1h" });
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: dummyUserId,
      email: "buyer@sagaelite.com",
      role: "customer",
      isActive: true,
    });

    const res = await request(app)
      .get("/api/v1/admin/search")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.status).toBe("fail");
    expect(res.body.message).toMatch(/Admin access required/i);
  });

  it("should reject standard admin on super-admin-only endpoint /api/v1/admin/users/export with 403", async () => {
    const token = jwt.sign({ id: dummyUserId }, secret, { expiresIn: "1h" });
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: dummyUserId,
      email: "staff@sagaelite.com",
      role: "admin",
      permissions: { users: true },
      isActive: true,
    });

    const res = await request(app)
      .get("/api/v1/admin/users/export")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.status).toBe("fail");
    expect(res.body.message).toMatch(/Super Admin access required/i);
  });

  it("should allow super_admin on super-admin-only endpoint", async () => {
    const token = jwt.sign({ id: dummyUserId }, secret, { expiresIn: "1h" });
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: dummyUserId,
      email: "founder@sagaelite.com",
      role: "super_admin",
      isActive: true,
    });

    // Mock User.find to return empty customer array (avoids aggregate buffering)
    vi.spyOn(User, "find").mockReturnValue({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await request(app)
      .get("/api/v1/admin/users/export")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
  });
});
