import { api } from "@/app/lib/api";
import type { ManageableTierName } from "@/app/lib/tiers";

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
  updatePlan: (plan: ManageableTierName) =>
    api.patch<UserProfile>("/api/user/profile", { plan }),
};
