import { api } from "@/app/lib/api";

export type GlacierTier = "Expedited" | "Standard" | "Bulk";

export interface ActiveRestore {
  key: string;
  batchId: string;
  batchStatus: string;
  retrievalLink: string | null;
  expiresAt: string | null;
}

export interface DownloadResult {
  standardUrls: { key: string; url: string }[];
  glacierInitiated: boolean;
  glacierAlreadyInProgress?: boolean;
  alreadyActive: ActiveRestore[];
}

export const downloadService = {
  requestDownload: (
    keys: string[],
    tier?: GlacierTier,
    albumId?: string,
    batchType?: string,
  ): Promise<DownloadResult> =>
    api.post<DownloadResult>("/api/files/restore", { keys, tier, albumId, batchType }),
};
