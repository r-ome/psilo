import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/forgot-password/route";
import { cognitoService } from "@/app/lib/services/cognito.service";

vi.mock("@/app/lib/services/cognito.service");
vi.mock("@/app/lib/env.server", () => ({
  env: { NODE_ENV: "test" },
}));

const API_URL = "http://localhost/api/auth/forgot-password";
const makeRequest = (body: unknown) =>
  new NextRequest(API_URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const validBody = { email: "test@test.com" };

const makeCognitoTokenResponse = () => ({
  $metadata: { httpStatusCode: 200 },
});

const makeCognitoError = (exception: string, message: string) => {
  const error = new Error(message);
  error.name = exception;
  return error;
};

describe("POST - /api/auth/forgot-password", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("request parsing", () => {
    it("returns 400 when body is invalid JSON", async () => {
      const res = await POST(
        new NextRequest(API_URL, {
          method: "POST",
          body: "invalid-json",
          headers: { "Content-Type": "application/json" },
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body).toEqual({ message: "Invalid request body." });
    });
  });

  describe("schema validation", () => {
    it("returns 422 when email is missing", async () => {
      const res = await POST(makeRequest({}));
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body).toEqual({ message: "Email is required" });
    });

    it("returns 422 when email is invalid", async () => {
      const res = await POST(makeRequest({ email: "test.com" }));
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body).toEqual({ message: "Must be a valid email address" });
    });

    it("returns 200 when inputs are valid", async () => {
      const res = await POST(makeRequest(validBody));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true });
    });
  });

  describe("Cognito Response", () => {
    it("returns 404 when cognitoService.forgotPassword returns UserNotFoundException", async () => {
      const errorMessage = "No account found with this email.";
      vi.mocked(cognitoService.forgotPassword).mockRejectedValueOnce(
        makeCognitoError("UserNotFoundException", errorMessage),
      );
      const res = await POST(makeRequest(validBody));
      const body = await res.json();
      expect(res.status).toBe(404);
      expect(body).toEqual({ message: errorMessage });
    });

    it("returns 200 when cognitoService.forgotPassword returns success", async () => {
      vi.mocked(cognitoService.forgotPassword).mockResolvedValueOnce(
        makeCognitoTokenResponse(),
      );
      const res = await POST(makeRequest(validBody));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true });
    });
  });
});
