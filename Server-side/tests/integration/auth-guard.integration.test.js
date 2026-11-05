import { describe, it, expect, vi, beforeEach } from "vitest";
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../app");
const User = require("../../Models/User");

describe("Auth Guard Integration", () => {
  const secret = process.env.JWT_SECRET || "development-jwt-secret-key-at-least-32-chars-long";
  const dummyUserId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should reject unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/v1/user/me");

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
    expect(res.body.message).toMatch(/not authenticated/i);
  });

  it("should reject invalid/malformed token with 401", async () => {
    const res = await request(app)
      .get("/api/v1/user/me")
      .set("Authorization", "Bearer invalid.malformed.token");

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  it("should reject loggedout cookie with 401", async () => {
    const res = await request(app)
      .get("/api/v1/user/me")
      .set("Cookie", ["token=loggedout"]);

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
    expect(res.body.message).toMatch(/session expired/i);
  });

  it("should reject token when user no longer exists in database", async () => {
    const token = jwt.sign({ id: dummyUserId }, secret, { expiresIn: "1h" });
    vi.spyOn(User, "findById").mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/user/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
    expect(res.body.message).toMatch(/user no longer exists/i);
  });

  it("should reject token when user account is deactivated (isActive = false)", async () => {
    const token = jwt.sign({ id: dummyUserId }, secret, { expiresIn: "1h" });
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: dummyUserId,
      email: "inactive@sagaelite.com",
      role: "customer",
      isActive: false,
    });

    const res = await request(app)
      .get("/api/v1/user/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.status).toBe("fail");
    expect(res.body.message).toMatch(/account has been deactivated/i);
  });

  it("should allow request and return profile when token and user are valid", async () => {
    const token = jwt.sign({ id: dummyUserId }, secret, { expiresIn: "1h" });
    const mockUser = {
      _id: dummyUserId,
      email: "client@sagaelite.com",
      username: "VIP Client",
      role: "customer",
      isActive: true,
      membership: "Elite",
      createdAt: new Date().toISOString(),
      select: vi.fn().mockReturnThis(),
    };

    // User.findById is called by authMiddleware and then by getMyProfile
    vi.spyOn(User, "findById").mockReturnValue({
      select: vi.fn().mockResolvedValue(mockUser),
      then: (resolve) => resolve(mockUser),
    });

    const res = await request(app)
      .get("/api/v1/user/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
    expect(res.body.data).toHaveProperty("email", "client@sagaelite.com");
  });
});

