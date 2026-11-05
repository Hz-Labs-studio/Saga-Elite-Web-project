import { describe, it, expect } from "vitest";
import { API_BASE_URL, API_V1_URL, API_ROOT_URL, ORDERS_API_URL } from "./api";

describe("Client API Configuration Unit Tests", () => {
  it("should declare valid API base and versioned endpoints", () => {
    expect(API_BASE_URL).toBeDefined();
    expect(API_V1_URL).toBe(`${API_BASE_URL}/v1`);
    expect(ORDERS_API_URL).toBe(`${API_V1_URL}/orders`);
    expect(API_ROOT_URL).toBe(API_BASE_URL);
  });

  it("should ensure API endpoints do not end with a trailing slash", () => {
    expect(API_BASE_URL.endsWith("/")).toBe(false);
    expect(API_V1_URL.endsWith("/")).toBe(false);
    expect(ORDERS_API_URL.endsWith("/")).toBe(false);
  });
});
