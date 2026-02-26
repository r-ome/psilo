import { authService, API_URL } from "@/app/lib/services/auth.services";
import { api } from "@/app/lib/api";

vi.mock("@/app/lib/api");

describe("authService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSession", () => {
    it("calls the correct url", async () => {
      vi.mocked(api.get).mockResolvedValueOnce({});
      await authService.getSession();
      expect(api.get).toBeCalledWith(`${API_URL}/session`);
    });

    it("returns what the api returns on success", async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ isAuthenticated: true });
      const result = await authService.getSession();
      expect(result).toEqual({ isAuthenticated: true });
    });
  });

  describe("login", () => {
    const body = { email: "test@test.com", password: "This1sValid" };
    it("calls the correct url", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      await authService.login(body);
      expect(api.post).toBeCalledWith(`${API_URL}/login`, body);
    });

    it("returns what the api returns on success", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      const result = await authService.login(body);
      expect(result).toEqual({ ok: true });
    });
  });

  describe("logout", () => {
    it("calls the correct url", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      await authService.logout();
      expect(api.post).toBeCalledWith(`${API_URL}/logout`, {});
    });

    it("returns what the api returns on success", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      const result = await authService.logout();
      expect(result).toEqual({ ok: true });
    });
  });

  describe("signup", () => {
    const body = {
      given_name: "John",
      family_name: "Doe",
      phone_number: "+639999999999",
      email: "test@test.com",
      password: "Th1sIsValid",
      confirm_password: "Th1sIsValid",
    };
    it("calls the correct url", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      await authService.signup(body);
      expect(api.post).toBeCalledWith(`${API_URL}/signup`, body);
    });

    it("returns what the api returns on success", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      const result = await authService.signup(body);
      expect(result).toEqual({ ok: true });
    });
  });

  describe("confirmSignUp", () => {
    const body = {
      email: "test@test.com",
      confirmationCode: "123456",
    };
    it("calls the correct url", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      await authService.confirmSignUp(body);
      expect(api.post).toBeCalledWith(`${API_URL}/signup/confirm`, body);
    });

    it("returns what the api returns on success", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      const result = await authService.confirmSignUp(body);
      expect(result).toEqual({ ok: true });
    });
  });

  describe("resendSignUpConfirmationCode", () => {
    const body = { email: "test@test.com" };
    it("calls the correct url", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      await authService.resendSignUpConfirmationCode(body);
      expect(api.post).toBeCalledWith(`${API_URL}/signup/resend`, body);
    });

    it("returns what the api returns on success", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      const result = await authService.resendSignUpConfirmationCode(body);
      expect(result).toEqual({ ok: true });
    });
  });

  describe("forgotPassword", () => {
    const body = { email: "test@test.com" };
    it("calls the correct url", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      await authService.forgotPassword(body);
      expect(api.post).toBeCalledWith(`${API_URL}/forgot-password`, body);
    });

    it("returns what the api returns on success", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      const result = await authService.forgotPassword(body);
      expect(result).toEqual({ ok: true });
    });
  });

  describe("confirmForgotPassword", () => {
    const body = {
      email: "test@test.com",
      confirmationCode: "123456",
      password: "Th1sIsValid",
    };
    it("calls the correct url", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      await authService.confirmForgotPassword(body);
      expect(api.post).toBeCalledWith(
        `${API_URL}/forgot-password/confirm`,
        body,
      );
    });

    it("returns what the api returns on success", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ ok: true });
      const result = await authService.confirmForgotPassword(body);
      expect(result).toEqual({ ok: true });
    });
  });
});
