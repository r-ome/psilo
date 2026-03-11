import { api } from "@/app/lib/api";

export type GlacierTier = "Expedited" | "Standard" | "Bulk";

export interface DownloadResult {
  standardUrls: { key: string; url: string }[];
  glacierInitiated: boolean;
  glacierAlreadyInProgress?: boolean;
}

export const downloadService = {
  requestDownload: (keys: string[], tier?: GlacierTier): Promise<DownloadResult> =>
    api.post<DownloadResult>("/api/files/restore", { keys, tier }),
};
