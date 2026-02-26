import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/logout/route";
import { cognitoService } from "@/app/lib/services/cognito.service";

vi.mock("@/app/lib/services/cognito.service");
vi.mock("@/app/lib/env.server", () => ({
  env: { NODE_ENV: "test" },
}));

const mockCookiesDelete = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ delete: mockCookiesDelete })),
}));

const API_URL = "http://localhost/api/auth/logout";
const makeRequest = (token?: string) =>
  new NextRequest(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && {
        Cookie: `access_token=${token}`,
      }),
    },
  });

const makeCognitoError = (exception: string, message: string) => {
  const error = new Error(message);
  error.name = exception;
  return error;
};

describe("POST /api/auth/logout", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("when no token in cookies", () => {
    it("returns 200", async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
    });

    it("deletes cookies", async () => {
      await POST(makeRequest());
      expect(mockCookiesDelete).toBeCalledWith("access_token");
      expect(mockCookiesDelete).toBeCalledWith("refresh_token");
      expect(mockCookiesDelete).toBeCalledWith("id_token");
    });

    it("never calls cognitoService.logout", async () => {
      await POST(makeRequest());
      expect(cognitoService.logout).not.toHaveBeenCalled();
    });
  });

  describe("when tokens are present", () => {
    it("returns 200", async () => {
      const res = await POST(makeRequest("mock-access-token"));
      expect(res.status).toBe(200);
    });

    it("deletes cookies on success", async () => {
      await POST(makeRequest("mock-access-token"));

      expect(mockCookiesDelete).toBeCalledWith("access_token");
      expect(mockCookiesDelete).toBeCalledWith("id_token");
      expect(mockCookiesDelete).toBeCalledWith("refresh_token");
    });

    it("calls cognitoService.logout with the token", async () => {
      await POST(makeRequest("mock-access-token"));
      expect(cognitoService.logout).toBeCalledWith("mock-access-token");
    });

    it("returns error when cognitoService.logout throws", async () => {
      vi.mocked(cognitoService.logout).mockRejectedValueOnce(
        makeCognitoError(
          "NotAuthorizedException",
          "Incorrect username or password.",
        ),
      );
      const res = await POST(makeRequest("mock-access-token"));
      const body = await res.json();
      expect(res.status).toBe(401);
      expect(body).toEqual({ message: "Incorrect username or password." });
    });
  });
});
