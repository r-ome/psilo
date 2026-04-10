import { NextRequest } from "next/server";
import { POST } from "@/app/api/files/preflight/route";
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
  new NextRequest("http://localhost/api/files/preflight", {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  });

describe("/api/files/preflight route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: vi.fn().mockResolvedValue({
          results: [{ clientId: "file-1", status: "new" }],
        }),
      } as unknown as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("proxies preflight requests to the backend", async () => {
    vi.mocked(getValidToken).mockResolvedValue("token");

    const res = await POST(
      makeRequest({
        items: [{ clientId: "file-1", filename: "test.jpg", contentType: "image/jpeg" }],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      results: [{ clientId: "file-1", status: "new" }],
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://backend.example.com/files/preflight",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("returns 400 when items is missing", async () => {
    vi.mocked(getValidToken).mockResolvedValue("token");

    const res = await POST(makeRequest({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ message: "items must be an array" });
  });
});
