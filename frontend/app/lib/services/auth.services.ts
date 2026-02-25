import { SignUpInput, ConfirmForgotPasswordInput } from "../schemas/auth";
import { api } from "@/app/lib/api";

const API_URL = `/api/auth`;

export const authService = {
  getSession: () => api.get<{ isAuthenticated: boolean }>("/api/auth/session"),
  login: (body: { email: string; password: string }) =>
    api.post(`${API_URL}/login`, body),
  logout: () => {
    api.post(`${API_URL}/logout`, {});
  },
  signup: (body: SignUpInput) => api.post(`${API_URL}/signup`, body),
  confirmSignUp: (body: { email: string; confirmationCode: string }) =>
    api.post(`${API_URL}/signup/confirm`, body),
  resendSignUpConfirmationCode: (body: { email: string }) =>
    api.post(`${API_URL}/signup/resend`, body),
  forgotPassword: (body: { email: string }) =>
    api.post(`${API_URL}/forgot-password`, body),
  confirmForgotPassword: (body: ConfirmForgotPasswordInput) =>
    api.post(`${API_URL}/forgot-password/confirm`, body),
};
