import { api } from "@/app/lib/api";

export interface UserProfile {
  id: string;
  email: string;
  givenName: string;
  familyName: string;
  plan: string;
  storageLimitBytes: number;
  createdAt: string | null;
}

export const userService = {
  getProfile: () => api.get<UserProfile>("/api/user/profile"),
};
