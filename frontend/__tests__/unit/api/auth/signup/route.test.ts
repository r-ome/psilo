import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/signup/route";
import { cognitoService } from "@/app/lib/services/cognito.service";

vi.mock("@/app/lib/services/cognito.service");
vi.mock("@/app/lib/env.server", () => ({
  env: { NODE_ENV: "test" },
}));

const API_URL = "http://localhost/api/auth/signup";
const makeRequest = (body: unknown) =>
  new NextRequest(API_URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
  });

const validBody = {
  given_name: "John",
  family_name: "Doe",
  phone_number: "+639999999999",
  email: "test@test.com",
  password: "This1sValid",
  confirm_password: "This1sValid",
};

const makeCognitoTokenResponse = () => ({
  $metadata: { httpStatusCode: 200 },
  UserConfirmed: false,
  UserSub: "mock",
});

const makeCognitoError = (exception: string, message: string) => {
  const error = new Error(message);
  error.name = exception;
  return error;
};

describe("POST /api/auth/signup", () => {
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
    it("returns 422 when given_name is missing", async () => {
      const res = await POST(
        makeRequest({
          family_name: "Doe",
          phone_number: "+639999999999",
          email: "test@test.com",
          password: "This1sValid",
          confirm_password: "This1sValid",
        }),
      );
      expect(res.status).toBe(422);
    });

    it("returns 422 when family_name is missing", async () => {
      const res = await POST(
        makeRequest({
          given_name: "Doe",
          phone_number: "+639999999999",
          email: "test@test.com",
          password: "This1sValid",
          confirm_password: "This1sValid",
        }),
      );
      expect(res.status).toBe(422);
    });

    it("returns 422 when phone_number is missing", async () => {
      const res = await POST(
        makeRequest({
          given_name: "John",
          family_name: "Doe",
          email: "test@test.com",
          password: "This1sValid",
          confirm_password: "This1sValid",
        }),
      );
      expect(res.status).toBe(422);
    });

    it("returns 422 when email is missing", async () => {
      const res = await POST(
        makeRequest({
          given_name: "John",
          family_name: "Doe",
          phone_number: "+639999999999",
          password: "This1sValid",
          confirm_password: "This1sValid",
        }),
      );
      expect(res.status).toBe(422);
    });

    it("returns 422 when password is missing", async () => {
      const res = await POST(
        makeRequest({
          given_name: "John",
          family_name: "Doe",
          phone_number: "+639999999999",
          email: "test@test.com",
          confirm_password: "This1sValid",
        }),
      );
      expect(res.status).toBe(422);
    });

    it("returns 422 when confirm_password is missing", async () => {
      const res = await POST(
        makeRequest({
          family_name: "Doe",
          phone_number: "+639999999999",
          email: "test@test.com",
          password: "This1sValid",
        }),
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
    it("returns 409 when cognitoService.signup throws UsernameExistsException", async () => {
      const errorMessage = "An account with this email already exists.";
      vi.mocked(cognitoService.signup).mockRejectedValueOnce(
        makeCognitoError("UsernameExistsException", errorMessage),
      );
      const res = await POST(makeRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body).toEqual({ message: errorMessage });
    });

    it("returns 200 when cognitoService.signup is success", async () => {
      vi.mocked(cognitoService.signup).mockResolvedValueOnce(
        makeCognitoTokenResponse(),
      );

      const res = await POST(makeRequest(validBody));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true });
    });
  });
});
