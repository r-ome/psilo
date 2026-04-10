import { NextRequest } from "next/server";
import { POST } from "@/app/api/photos/retry-failed/route";
import { getValidToken } from "@/app/lib/auth/token";

vi.mock("@/app/lib/auth/token", () => ({
  getValidToken: vi.fn(),
}));

vi.mock("@/app/lib/env.server", () => ({
  env: { BACKEND_API_URL: "https://backend.example.com" },
}));

vi.mock("@/app/lib/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const makeRequest = (body?: unknown) =>
  new NextRequest("http://localhost/api/photos/retry-failed", {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  });

describe("/api/photos/retry-failed route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: vi.fn().mockResolvedValue({
          message: "Failed photos queued for retry",
          queuedCount: 1,
          missingCount: 0,
        }),
      } as unknown as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("proxies retry requests to the backend", async () => {
    vi.mocked(getValidToken).mockResolvedValue("token");

    const res = await POST(
      makeRequest({ keys: ["users/u1/photos/photo.jpg"] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      message: "Failed photos queued for retry",
      queuedCount: 1,
      missingCount: 0,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://backend.example.com/photos/retry-failed",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ keys: ["users/u1/photos/photo.jpg"] }),
      }),
    );
  });

  it("returns 400 when keys is missing", async () => {
    vi.mocked(getValidToken).mockResolvedValue("token");

    const res = await POST(makeRequest({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ message: "Missing keys array" });
  });

  it("returns 401 without an access token", async () => {
    vi.mocked(getValidToken).mockResolvedValue(null);

    const res = await POST(makeRequest({ keys: ["users/u1/photos/photo.jpg"] }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ message: "Unauthorized" });
  });
});
