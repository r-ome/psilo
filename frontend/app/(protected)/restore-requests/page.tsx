"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/app/components/ui/accordion";
import {
  retrievalService,
  RetrievalBatch,
  RetrievalRequest,
} from "@/app/lib/services/retrieval.service";
import { formatDate } from "@/app/lib/utils";
import { differenceInDays, differenceInHours } from "date-fns";
import { Button } from "@/app/components/ui/button";

const date_format = "MMM d, yyyy h:mm aaa";

const IN_FLIGHT_STATUSES: RetrievalBatch["status"][] = [
  "PENDING",
  "IN_PROGRESS",
  "ZIPPING",
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const STATUS_BADGE: Record<
  RetrievalBatch["status"],
  { label: string; className: string }
> = {
  PENDING: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
  IN_PROGRESS: { label: "Restoring", className: "bg-blue-100 text-blue-800" },
  ZIPPING: { label: "Zipping", className: "bg-blue-100 text-blue-800" },
  COMPLETED: { label: "Ready", className: "bg-green-100 text-green-800" },
  PARTIAL_FAILURE: {
    label: "Partial",
    className: "bg-orange-100 text-orange-800",
  },
  PARTIAL: { label: "Partial", className: "bg-orange-100 text-orange-800" },
  AVAILABLE: { label: "Available", className: "bg-green-100 text-green-800" },
  EXPIRED: { label: "Expired", className: "bg-gray-100 text-gray-600" },
  FAILED: { label: "Failed", className: "bg-red-100 text-red-800" },
};

const REQUEST_STATUS_BADGE: Record<
  RetrievalRequest["status"],
  { label: string; className: string }
> = {
  PENDING: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
  IN_PROGRESS: { label: "Restoring", className: "bg-blue-100 text-blue-800" },
  READY: { label: "Ready", className: "bg-green-100 text-green-800" },
  AVAILABLE: { label: "Available", className: "bg-green-100 text-green-800" },
  EXPIRED: { label: "Expired", className: "bg-gray-100 text-gray-600" },
  FAILED: { label: "Failed", className: "bg-red-100 text-red-800" },
};

function StatusBadge({ status }: { status: RetrievalBatch["status"] }) {
  const { label, className } = STATUS_BADGE[status] ?? STATUS_BADGE.PENDING;
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${className}`}
    >
      {label}
    </span>
  );
}

function RequestStatusBadge({
  status,
}: {
  status: RetrievalRequest["status"];
}) {
  const { label, className } =
    REQUEST_STATUS_BADGE[status] ?? REQUEST_STATUS_BADGE.PENDING;
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${className}`}
    >
      {label}
    </span>
  );
}

function ExpiresIn({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return <span className="text-muted-foreground">—</span>;
  const now = new Date();
  const exp = new Date(expiresAt);
  const hours = differenceInHours(exp, now);
  if (hours <= 0) return <span className="text-muted-foreground">Expired</span>;
  const days = differenceInDays(exp, now);
  return (
    <span className="text-muted-foreground">
      {days < 1 ? `${hours}h left` : `${days}d left`}
    </span>
  );
}

function BatchDetail({
  batchId,
  batchStatus,
}: {
  batchId: string;
  batchStatus: RetrievalBatch["status"];
}) {
  const [requests, setRequests] = useState<RetrievalRequest[] | null>(null);
  const [loading, setLoading] = useState(true);

  const isZipFlow =
    batchStatus === "COMPLETED" || batchStatus === "PARTIAL_FAILURE";

  useEffect(() => {
    retrievalService
      .getBatch(batchId)
      .then((data) => setRequests(data.requests))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, [batchId]);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!requests || requests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">No files found.</p>
    );
  }

  const zipUrl = isZipFlow
    ? (requests.find((r) => r.retrievalLink)?.retrievalLink ?? null)
    : null;

  return (
    <div className="space-y-3">
      {isZipFlow && (
        <div className="flex my-3 items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
          <div className="flex-1">
            <p className="text-sm font-medium text-green-900">
              {batchStatus === "COMPLETED"
                ? "Your zip file is ready to download."
                : "Zip is ready — some files failed to include."}
            </p>
            <p className="text-xs text-green-700 mt-0.5">
              Link expires in 7 days.
            </p>
          </div>
          {zipUrl ? (
            <Button asChild size="sm" className="shrink-0">
              <a href={zipUrl} download>
                <DownloadIcon className="h-4 w-4 mr-1.5" />
                Download Zip
              </a>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Link expired</span>
          )}
        </div>
      )}

      <table className="w-full text-sm my-4">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="pb-1 pr-4 font-medium">File</th>
            <th className="pb-1 pr-4 font-medium">Size</th>
            <th className="pb-1 pr-4 font-medium">Status</th>
            <th className="pb-1 pr-4 font-medium">Available At</th>
            {!isZipFlow && <th className="pb-1 font-medium"></th>}
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => (
            <tr
              key={req.id}
              className="border-b last:border-0 hover:bg-gray-100"
            >
              <td className="py-1.5 pr-4 max-w-50 truncate">
                {req.filename ?? req.s3Key.split("/").pop()}
              </td>
              <td className="py-1.5 pr-4 text-muted-foreground">
                {formatBytes(req.fileSize)}
              </td>
              <td className="py-1.5 pr-4">
                <RequestStatusBadge status={req.status} />
              </td>
              <td className="py-1.5 pr-4 text-muted-foreground">
                {req.availableAt
                  ? formatDate(req.availableAt, date_format)
                  : "—"}
              </td>
              {!isZipFlow && (
                <td className="py-1.5">
                  {req.retrievalLink && req.status !== "EXPIRED" ? (
                    <a
                      href={req.retrievalLink}
                      download
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Download
                    </a>
                  ) : req.retrievalLink ? (
                    <span className="text-xs text-muted-foreground">
                      Expired
                    </span>
                  ) : null}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RestoreRequestsPage() {
  const [batches, setBatches] = useState<RetrievalBatch[] | null>(null);

  const fetchBatches = () =>
    retrievalService
      .listBatches()
      .then((data) => setBatches(data.batches))
      .catch(() => setBatches([]));

  useEffect(() => {
    fetchBatches();
  }, []);

  // Poll while any batch is still in-flight
  useEffect(() => {
    if (!batches) return;
    const hasInFlight = batches.some((b) =>
      IN_FLIGHT_STATUSES.includes(b.status),
    );
    if (!hasInFlight) return;
    const interval = setInterval(fetchBatches, 5000);
    return () => clearInterval(interval);
  }, [batches]);

  if (batches === null) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Restore Requests</h1>

      {batches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No restore requests yet.
        </p>
      ) : (
        <Accordion type="single" collapsible className="w-full px-30">
          {batches.map((batch) => (
            <AccordionItem key={batch.id} value={batch.id}>
              <AccordionTrigger className="hover:no-underline cursor-pointer hover:bg-gray-100 px-4">
                <div className="flex items-center gap-4 text-sm w-full mr-2">
                  <span className="font-medium capitalize">
                    {batch.batchType.toLowerCase()}
                  </span>
                  <span className="text-muted-foreground capitalize">
                    {batch.retrievalTier.toLowerCase()}
                  </span>
                  <StatusBadge status={batch.status} />
                  {IN_FLIGHT_STATUSES.includes(batch.status) && (
                    <Loader2Icon className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                  <span className="text-muted-foreground">
                    {batch.totalFiles} file{batch.totalFiles !== 1 ? "s" : ""}
                    {batch.totalSize > 0 &&
                      ` · ${formatBytes(batch.totalSize)}`}
                  </span>
                  <span className="text-xs ml-auto">
                    <ExpiresIn expiresAt={batch.expiresAt} />
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {batch.requestedAt
                      ? formatDate(batch.requestedAt, date_format)
                      : ""}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-10">
                <BatchDetail batchId={batch.id} batchStatus={batch.status} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
