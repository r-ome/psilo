import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/login/route";
import { cognitoService } from "@/app/lib/services/cognito.service";

vi.mock("@/app/lib/services/cognito.service");
vi.mock("@/app/lib/env.server", () => ({
  env: { NODE_ENV: "test" },
}));

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ set: mockCookieSet })),
}));

const API_URL = "http://localhost/api/auth/login";
const makeRequest = (body: unknown) =>
  new NextRequest(API_URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const validBody = {
  email: "test@test.com",
  password: "This1sValid",
};

const makeCognitoTokenResponse = (ok: boolean = true) => ({
  $metadata: { httpStatusCode: 200 },
  AuthenticationResult: ok
    ? {
        AccessToken: "mock-access-token",
        IdToken: "mock-id-token",
        RefreshToken: "mock-refresh-token",
      }
    : undefined,
});

const makeCognitoError = (exception: string, message: string) => {
  const error = new Error(message);
  error.name = exception;
  return error;
};

describe("POST /api/auth/login", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("request parsing", () => {
    it("returns 400 when body is invalid JSON", async () => {
      const req = new NextRequest(API_URL, {
        method: "POST",
        body: "invalid-json",
        headers: { "Content-Type": "application/json" },
      });
      const res = await POST(req);
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.message).toBe("Invalid request body.");
    });
  });

  describe("schema validation", () => {
    it("returns 422 when email is missing", async () => {
      const res = await POST(makeRequest({ password: "This1sValid" }));
      const body = await res.json();
      expect(res.status).toBe(422);
      expect(body).toEqual({ message: "Email is required" });
    });

    it("returns 422 when email is invalid", async () => {
      const res = await POST(
        makeRequest({ email: "test.com", password: "This1sValid" }),
      );
      const body = await res.json();
      expect(res.status).toBe(422);
      expect(body).toEqual({ message: "Must be a valid email address" });
    });

    it("returns 422 when password is missing", async () => {
      const res = await POST(makeRequest({ email: "test@test.com" }));
      const body = await res.json();
      expect(res.status).toBe(422);
      expect(body).toEqual({ message: "Password is required" });
    });

    it("returns 422 when password is less than 8 characters", async () => {
      const res = await POST(
        makeRequest({ email: "test@test.com", password: "1234567" }),
      );
      const body = await res.json();
      expect(res.status).toBe(422);
      expect(body).toEqual({
        message: "Password must be at least 8 characters",
      });
    });
  });

  describe("Cognito Response", () => {
    it("returns 401 when cognitoService.login returns AuthenticationResult undefined", async () => {
      vi.mocked(cognitoService.login).mockResolvedValueOnce(
        makeCognitoTokenResponse(false),
      );

      const res = await POST(makeRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body).toEqual({ message: "Login failed." });
    });

    it("returns 401 when cognitoService.login throws NotAuthorizedException", async () => {
      const errorMessage = "Incorrect username or password.";
      vi.mocked(cognitoService.login).mockRejectedValueOnce(
        makeCognitoError("NotAuthorizedException", errorMessage),
      );

      const res = await POST(makeRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body).toEqual({ message: errorMessage });
    });

    it("returns 404 when cognitoService.login throws UserNotFoundException", async () => {
      const errorMessage = "No account found with this email.";
      vi.mocked(cognitoService.login).mockRejectedValueOnce(
        makeCognitoError("UserNotFoundException", errorMessage),
      );
      const res = await POST(makeRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body).toEqual({ message: errorMessage });
    });

    it("returns 403 when cognitoService.login throws UserNotConfirmedException", async () => {
      const errorMessage = "Account not confirmed. Please verify your email.";
      vi.mocked(cognitoService.login).mockRejectedValueOnce(
        makeCognitoError("UserNotConfirmedException", errorMessage),
      );
      const res = await POST(makeRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body).toEqual({ message: errorMessage });
    });

    it("returns 200 when cognitoService.login is success", async () => {
      vi.mocked(cognitoService.login).mockResolvedValueOnce(
        makeCognitoTokenResponse(),
      );

      const res = await POST(makeRequest(validBody));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true });
    });
  });

  describe("Cookies", () => {
    it("sets access_token on successful login", async () => {
      vi.mocked(cognitoService.login).mockResolvedValueOnce(
        makeCognitoTokenResponse(),
      );
      await POST(makeRequest(validBody));
      expect(mockCookieSet).toBeCalledWith(
        "access_token",
        "mock-access-token",
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: "strict",
          maxAge: 60 * 60,
        }),
      );
    });

    it("sets id_token on successful login", async () => {
      vi.mocked(cognitoService.login).mockResolvedValueOnce(
        makeCognitoTokenResponse(),
      );
      await POST(makeRequest(validBody));
      expect(mockCookieSet).toBeCalledWith(
        "id_token",
        "mock-id-token",
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: "strict",
          maxAge: 60 * 60,
        }),
      );
    });

    it("sets refresh_token on successful login", async () => {
      vi.mocked(cognitoService.login).mockResolvedValueOnce(
        makeCognitoTokenResponse(),
      );
      await POST(makeRequest(validBody));
      expect(mockCookieSet).toBeCalledWith(
        "refresh_token",
        "mock-refresh-token",
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: "strict",
          maxAge: 60 * 60 * 24 * 30,
        }),
      );
    });
  });
});
