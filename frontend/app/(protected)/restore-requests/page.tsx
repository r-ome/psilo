"use client";

import { useEffect, useState } from "react";
import {
  Filter,
  MoreHorizontal,
  DownloadIcon,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2Icon,
  FolderOpen,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import {
  retrievalService,
  RetrievalBatch,
  RetrievalRequest,
} from "@/app/lib/services/retrieval.service";
import { formatDate } from "@/app/lib/utils";
import { differenceInDays, differenceInHours } from "date-fns";

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

const STATUS_CONFIG: Record<
  RetrievalBatch["status"],
  {
    label: string;
    className: string;
    icon: typeof Clock;
  }
> = {
  PENDING: {
    label: "Pending",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: Clock,
  },
  IN_PROGRESS: {
    label: "Restoring",
    className: "bg-blue-100 text-blue-800 border-blue-200",
    icon: Loader2Icon,
  },
  ZIPPING: {
    label: "Zipping",
    className: "bg-blue-100 text-blue-800 border-blue-200",
    icon: Loader2Icon,
  },
  COMPLETED: {
    label: "Ready",
    className: "bg-green-100 text-green-800 border-green-200",
    icon: CheckCircle2,
  },
  PARTIAL_FAILURE: {
    label: "Partial",
    className: "bg-orange-100 text-orange-800 border-orange-200",
    icon: CheckCircle2,
  },
  PARTIAL: {
    label: "Partial",
    className: "bg-orange-100 text-orange-800 border-orange-200",
    icon: CheckCircle2,
  },
  AVAILABLE: {
    label: "Available",
    className: "bg-green-100 text-green-800 border-green-200",
    icon: CheckCircle2,
  },
  EXPIRED: {
    label: "Expired",
    className: "bg-gray-100 text-gray-600 border-gray-200",
    icon: Clock,
  },
  FAILED: {
    label: "Failed",
    className: "bg-red-100 text-red-800 border-red-200",
    icon: XCircle,
  },
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
    <div className="space-y-3 px-4 pb-4">
      {isZipFlow && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
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

      <table className="w-full text-sm">
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
              className="border-b last:border-0 hover:bg-muted/50"
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

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

  const filteredBatches = batches.filter(
    (batch) => statusFilter === "all" || batch.status === statusFilter,
  );

  const pendingCount = batches.filter((b) => b.status === "PENDING").length;
  const inProgressCount = batches.filter(
    (b) => b.status === "IN_PROGRESS" || b.status === "ZIPPING",
  ).length;
  const completedCount = batches.filter(
    (b) => b.status === "COMPLETED" || b.status === "AVAILABLE",
  ).length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Restore Requests
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage and track your Glacier storage restore requests
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-2xl font-bold">{batches.length}</p>
              </div>
              <RefreshCw className="size-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{pendingCount}</p>
              </div>
              <Clock className="size-8 text-chart-4/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold">{inProgressCount}</p>
              </div>
              <Loader2Icon className="size-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{completedCount}</p>
              </div>
              <CheckCircle2 className="size-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Request History</CardTitle>
              <CardDescription>
                View and manage all your restore requests
              </CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <Filter className="mr-2 size-4" />
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent className="space-y-1">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="PENDING">
                  <span className="size-2 rounded-full bg-yellow-500" />
                  Pending
                </SelectItem>
                <SelectItem value="IN_PROGRESS">
                  <span className="size-2 rounded-full bg-blue-500" />
                  In Progress
                </SelectItem>
                <SelectItem value="ZIPPING">
                  <span className="size-2 rounded-full bg-blue-500" />
                  Zipping
                </SelectItem>
                <SelectItem value="COMPLETED">
                  <span className="size-2 rounded-full bg-green-500" />
                  Completed
                </SelectItem>
                <SelectItem value="AVAILABLE">
                  <span className="size-2 rounded-full bg-green-500" />
                  Available
                </SelectItem>
                <SelectItem value="EXPIRED">
                  <span className="size-2 rounded-full bg-gray-400" />
                  Expired
                </SelectItem>
                <SelectItem value="FAILED">
                  <span className="size-2 rounded-full bg-red-500" />
                  Failed
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Type</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Files</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBatches.map((batch) => {
                  const config = STATUS_CONFIG[batch.status];
                  const StatusIcon = config.icon;
                  const isExpanded = expandedBatch === batch.id;
                  const isAnimating =
                    batch.status === "IN_PROGRESS" ||
                    batch.status === "ZIPPING";

                  return (
                    <TableRow
                      key={batch.id}
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedBatch(isExpanded ? null : batch.id)
                      }
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FolderOpen className="size-4 text-muted-foreground" />
                          <span className="capitalize">
                            {batch.batchType.toLowerCase()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">
                        {batch.retrievalTier.toLowerCase()}
                      </TableCell>
                      <TableCell>
                        {batch.totalFiles} file
                        {batch.totalFiles !== 1 ? "s" : ""}
                      </TableCell>
                      <TableCell>
                        {batch.totalSize > 0
                          ? formatBytes(batch.totalSize)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`gap-1 ${config.className}`}
                        >
                          <StatusIcon
                            className={`size-3 ${isAnimating ? "animate-spin" : ""}`}
                          />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ExpiresIn expiresAt={batch.expiresAt} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {batch.requestedAt
                          ? formatDate(batch.requestedAt, date_format)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(batch.status === "COMPLETED" ||
                              batch.status === "AVAILABLE") && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedBatch(batch.id);
                                }}
                              >
                                <DownloadIcon className="mr-2 size-4" />
                                View Downloads
                              </DropdownMenuItem>
                            )}
                            {IN_FLIGHT_STATUSES.includes(batch.status) && (
                              <DropdownMenuItem disabled>
                                <Loader2Icon className="mr-2 size-4 animate-spin" />
                                Processing…
                              </DropdownMenuItem>
                            )}
                            {batch.status === "FAILED" && (
                              <DropdownMenuItem disabled>
                                <XCircle className="mr-2 size-4" />
                                Failed
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredBatches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      <p className="text-muted-foreground">
                        No restore requests found.
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Expanded batch detail */}
          {expandedBatch && (
            <div className="mt-4 rounded-lg border border-border">
              <div className="flex items-center justify-between px-4 pt-3">
                <p className="text-sm font-medium">Batch Details</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedBatch(null)}
                >
                  Close
                </Button>
              </div>
              <BatchDetail
                batchId={expandedBatch}
                batchStatus={
                  batches.find((b) => b.id === expandedBatch)?.status ??
                  "PENDING"
                }
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
