import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/forgot-password/confirm/route";
import { cognitoService } from "@/app/lib/services/cognito.service";

vi.mock("@/app/lib/services/cognito.service");
vi.mock("@/app/lib/env.server", () => ({
  env: { NODE_ENV: "test" },
}));

const API_URL = "http://localhost/api/auth/forgot-password/confirm";
const makeRequest = (body: unknown) =>
  new NextRequest(API_URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const validBody = {
  email: "test@test.com",
  confirmationCode: "123456",
  password: "This1sValid",
};

const makeCognitoTokenResponse = () => ({
  $metadata: { httpStatusCode: 200 },
});

const makeCognitoError = (exception: string, message: string) => {
  const error = new Error(message);
  error.name = exception;
  return error;
};

describe("POST /api/auth/forgot-password/confirm", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("request parsing", () => {
    it("returns 400 when body is invalid JSON", async () => {
      const res = await POST(
        new NextRequest(API_URL, {
          method: "POST",
          body: "invalid-body",
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
      const res = await POST(
        makeRequest({ confirmationCode: "123456", password: "This1sValid" }),
      );

      expect(res.status).toBe(422);
    });

    it("returns 422 when confirmationCode is missing", async () => {
      const res = await POST(
        makeRequest({ email: "test@test.com", password: "This1sValid" }),
      );
      expect(res.status).toBe(422);
    });

    it("returns 422 when password is missing", async () => {
      const res = await POST(
        makeRequest({ email: "test@test.com", confirmationCode: "123456" }),
      );
      expect(res.status).toBe(422);
    });

    it("returns 200 when inputs are valid", async () => {
      const res = await POST(makeRequest(validBody));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true });
    });
  });

  describe("Cognito Response", () => {
    it("returns 400 when cognitoService.confirmForgotPassword returns CodeMismatchException", async () => {
      const errorMessage = "Invalid verification code.";
      vi.mocked(cognitoService.confirmForgotPassword).mockRejectedValueOnce(
        makeCognitoError("CodeMismatchException", errorMessage),
      );
      const res = await POST(makeRequest(validBody));
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body).toEqual({ message: errorMessage });
    });

    it("returns 429 when cognitoService.confirmForgotPassword returns TooManyFailedAttemptsException", async () => {
      const errorMessage = "Too many failed attempts. Try again later.";
      vi.mocked(cognitoService.confirmForgotPassword).mockRejectedValueOnce(
        makeCognitoError("TooManyFailedAttemptsException", errorMessage),
      );
      const res = await POST(makeRequest(validBody));
      const body = await res.json();
      expect(res.status).toBe(429);
      expect(body).toEqual({ message: errorMessage });
    });

    it("returns 200 when cognitoService.confirmForgotPassword returns success", async () => {
      vi.mocked(cognitoService.confirmForgotPassword).mockResolvedValueOnce(
        makeCognitoTokenResponse(),
      );
      const res = await POST(makeRequest(validBody));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true });
    });
  });
});
