import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/user/profile/route";
import { getValidToken } from "@/app/lib/auth/token";

vi.mock("@/app/lib/auth/token", () => ({
  getValidToken: vi.fn(),
}));

vi.mock("@/app/lib/env.server", () => ({
  env: { BACKEND_API_URL: "https://backend.example.com" },
}));

const makeRequest = (body?: unknown) =>
  new NextRequest("http://localhost/api/user/profile", {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  });

describe("/api/user/profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: "u1",
          plan: "standard",
          storageLimitBytes: 1_099_511_627_776,
        }),
      } as unknown as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("proxies PATCH requests to the backend", async () => {
    vi.mocked(getValidToken).mockResolvedValue("token");

    const res = await PATCH(makeRequest({ plan: "standard" }));

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://backend.example.com/user/profile",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ plan: "standard" }),
      }),
    );
  });

  it("returns 422 for invalid plan values", async () => {
    vi.mocked(getValidToken).mockResolvedValue("token");

    const res = await PATCH(makeRequest({ plan: "gold" }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body).toEqual({ message: "Invalid plan" });
  });

  it("returns 401 without an access token", async () => {
    vi.mocked(getValidToken).mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ message: "Unauthorized" });
  });
});
