import { api } from "@/app/lib/api";

export interface RetrievalBatch {
  id: string;
  batchType: "SINGLE" | "ALBUM" | "MANUAL";
  sourceId: string | null;
  retrievalTier: "EXPEDITED" | "STANDARD" | "BULK";
  status:
    | "PENDING"
    | "IN_PROGRESS"
    | "ZIPPING"
    | "COMPLETED"
    | "PARTIAL_FAILURE"
    | "PARTIAL"
    | "AVAILABLE"
    | "EXPIRED"
    | "FAILED";
  totalFiles: number;
  totalSize: number;
  requestedAt: string;
  availableAt: string | null;
  expiresAt: string | null;
}

export interface RetrievalRequest {
  id: string;
  batchId: string;
  photoId: string;
  s3Key: string;
  filename: string | null;
  fileSize: number;
  status: "PENDING" | "IN_PROGRESS" | "READY" | "AVAILABLE" | "EXPIRED" | "FAILED";
  retrievalLink: string | null;
  requestedAt: string;
  availableAt: string | null;
  expiresAt: string | null;
}

export const retrievalService = {
  listBatches: () =>
    api.get<{ batches: RetrievalBatch[] }>("/api/retrieval/batches"),
  getBatch: (batchId: string) =>
    api.get<{ batch: RetrievalBatch; requests: RetrievalRequest[] }>(
      `/api/retrieval/batches/${batchId}`,
    ),
};
