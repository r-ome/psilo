import { NextRequest } from "next/server";

const mockCookieGet = vi.fn();
const mockCookieSet = vi.fn();

vi.mock("@/app/lib/services/cognito.service");
vi.mock("@/app/lib/env.server", () => ({
  env: { NODE_ENV: "test" },
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      get: mockCookieGet,
      set: mockCookieSet,
    }),
  ),
}));

import { GET } from "@/app/api/auth/refresh/route";
import { cognitoService } from "@/app/lib/services/cognito.service";

const makeRequest = (next?: string) => {
  const url = new URL("http://localhost/api/auth/refresh");
  if (next !== undefined) {
    url.searchParams.set("next", next);
  }
  return new NextRequest(url, { method: "GET" });
};

describe("GET /api/auth/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieGet.mockImplementation((name: string) => {
      if (name === "refresh_token") return { value: "refresh-token" };
      return undefined;
    });
    vi.mocked(cognitoService.refreshTokens).mockResolvedValue({
      AuthenticationResult: {
        AccessToken: "new-access-token",
        IdToken: "new-id-token",
      },
    } as never);
  });

  it("redirects to the requested internal path", async () => {
    const res = await GET(makeRequest("/dashboard"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("falls back to / for an external next value", async () => {
    const res = await GET(makeRequest("https://evil.com/phish"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
  });
});
