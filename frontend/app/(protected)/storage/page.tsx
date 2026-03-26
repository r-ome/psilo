"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { photoService, StorageSize } from "@/app/lib/services/photo.service";
import {
  retrievalService,
  RetrievalBatch,
} from "@/app/lib/services/retrieval.service";
import {
  HardDrive,
  Snowflake,
  RotateCcw,
  TrendingUp,
  Zap,
  Clock,
  InfoIcon,
  Loader2Icon,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";
import { formatStorage, convertUsdToPhp } from "@/app/lib/utils";

const TIER_INFO: Record<
  string,
  {
    speed: string;
    cost: string;
    costUsdPerGB: number;
    costUsdPer1000Req: number;
  }
> = {
  EXPEDITED: {
    speed: "1–5 minutes",
    cost: "$0.03/GB + $0.01/1,000 requests",
    costUsdPerGB: 0.03,
    costUsdPer1000Req: 0.01,
  },
  STANDARD: {
    speed: "3–5 hours",
    cost: "$0.01/GB + $0.05/1,000 requests",
    costUsdPerGB: 0.01,
    costUsdPer1000Req: 0.05,
  },
  BULK: {
    speed: "5–12 hours",
    cost: "$0.025/1,000 requests",
    costUsdPerGB: 0,
    costUsdPer1000Req: 0.025,
  },
};

export default function StoragePage() {
  const [storageData, setStorageData] = useState<StorageSize | null>(null);
  const [batches, setBatches] = useState<RetrievalBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [storageResult, batchesResult] = await Promise.all([
          photoService.getStorageSize(),
          retrievalService.listBatches(),
        ]);
        setStorageData(storageResult);
        setBatches(batchesResult.batches);
        setError(null);
      } catch (err) {
        setError("Failed to load storage information");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const standardSizeGB = (storageData?.standardSize ?? 0) / 1024 ** 3;
  const glacierSizeGB = (storageData?.glacierSize ?? 0) / 1024 ** 3;
  const thumbnailSizeGB = (storageData?.thumbnailSize ?? 0) / 1024 ** 3;
  const totalSizeGB = standardSizeGB + glacierSizeGB + thumbnailSizeGB;
  const standardCount = storageData?.standardCount ?? 0;

  const standardCost = standardSizeGB * 0.025;
  const glacierCost = glacierSizeGB * 0.0045;
  const thumbnailCost = thumbnailSizeGB * 0.025;
  const transitionCost = (standardCount / 1000) * 0.03;
  const totalCost = standardCost + glacierCost + thumbnailCost + transitionCost;

  const totalRequests = batches.length;
  const requestsByTier = batches.reduce(
    (acc, batch) => {
      const tier = batch.retrievalTier;
      acc[tier] = (acc[tier] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const retrievalSizeByTierGB = {
    EXPEDITED:
      (storageData?.retrievalSizeByTier?.["EXPEDITED"] ?? 0) / 1024 ** 3,
    STANDARD:
      (storageData?.retrievalSizeByTier?.["STANDARD"] ?? 0) / 1024 ** 3,
    BULK: (storageData?.retrievalSizeByTier?.["BULK"] ?? 0) / 1024 ** 3,
  };

  const costByTier = {
    EXPEDITED:
      retrievalSizeByTierGB.EXPEDITED * 0.03 +
      ((requestsByTier["EXPEDITED"] ?? 0) * 0.01) / 1000,
    STANDARD:
      retrievalSizeByTierGB.STANDARD * 0.01 +
      ((requestsByTier["STANDARD"] ?? 0) * 0.05) / 1000,
    BULK: ((requestsByTier["BULK"] ?? 0) * 0.025) / 1000,
  };
  const totalRetrievalCost =
    costByTier.EXPEDITED + costByTier.STANDARD + costByTier.BULK;

  const pendingCount = batches.filter(
    (b) => b.status === "PENDING" || b.status === "IN_PROGRESS",
  ).length;
  const completedCount = batches.filter(
    (b) => b.status === "COMPLETED" || b.status === "AVAILABLE",
  ).length;
  const lastBatch = batches.sort(
    (a, b) =>
      new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
  )[0];
  const lastRequestLabel = lastBatch
    ? timeAgo(new Date(lastBatch.requestedAt))
    : "None";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Storage</h1>
        <p className="text-sm text-muted-foreground">
          Manage your storage across different tiers
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Overview Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="size-5" />
                    Total Storage
                  </CardTitle>
                  <CardDescription>
                    Combined usage across all storage tiers
                  </CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">
                    Est. ${totalCost.toFixed(4)}/mo · ₱
                    {convertUsdToPhp(totalCost).toFixed(2)}/mo
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-end justify-between">
                  <div>
                    <span className="text-4xl font-bold">
                      {formatStorage(
                        (storageData?.standardSize ?? 0) +
                          (storageData?.glacierSize ?? 0) +
                          (storageData?.thumbnailSize ?? 0),
                      )}
                    </span>
                  </div>
                </div>
                <div className="relative h-4 overflow-hidden rounded-full bg-secondary">
                  {totalSizeGB > 0 && (
                    <>
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
                        style={{
                          width: `${(standardSizeGB / totalSizeGB) * 100}%`,
                        }}
                      />
                      <div
                        className="absolute inset-y-0 bg-chart-2 transition-all"
                        style={{
                          left: `${(standardSizeGB / totalSizeGB) * 100}%`,
                          width: `${(glacierSizeGB / totalSizeGB) * 100}%`,
                        }}
                      />
                    </>
                  )}
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="size-3 rounded-full bg-primary" />
                    <span>
                      Standard:{" "}
                      {formatStorage(storageData?.standardSize ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="size-3 rounded-full bg-chart-2" />
                    <span>
                      Glacier:{" "}
                      {formatStorage(storageData?.glacierSize ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="size-3 rounded-full bg-muted-foreground/30" />
                    <span>
                      Thumbnails:{" "}
                      {formatStorage(storageData?.thumbnailSize ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Storage Tier Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Standard */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
                      <Zap className="size-4 text-primary-foreground" />
                    </div>
                    Standard Class
                  </CardTitle>
                </div>
                <CardDescription>
                  Instantly accessible storage for frequently used files
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <span className="text-2xl font-bold">
                        {formatStorage(storageData?.standardSize ?? 0)}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {(
                        (storageData?.standardPhotoCount ?? 0) +
                        (storageData?.standardVideoCount ?? 0)
                      ).toLocaleString()}{" "}
                      files
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {(storageData?.standardPhotoCount ?? 0).toLocaleString()}{" "}
                    photos,{" "}
                    {(storageData?.standardVideoCount ?? 0).toLocaleString()}{" "}
                    videos
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ${standardCost.toFixed(4)}/mo · ₱
                    {convertUsdToPhp(standardCost).toFixed(2)}/mo
                    <span className="text-xs text-muted-foreground/60 ml-1">
                      ($0.025/GB)
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Glacier */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-chart-2">
                      <Snowflake className="size-4 text-primary-foreground" />
                    </div>
                    Glacier Class
                  </CardTitle>
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="size-3" />
                    1-5 hr retrieval
                  </Badge>
                </div>
                <CardDescription>
                  Cold storage for archived files with retrieval time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <span className="text-2xl font-bold">
                        {formatStorage(storageData?.glacierSize ?? 0)}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {(
                        (storageData?.glacierPhotoCount ?? 0) +
                        (storageData?.glacierVideoCount ?? 0)
                      ).toLocaleString()}{" "}
                      files
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {(storageData?.glacierPhotoCount ?? 0).toLocaleString()}{" "}
                    photos,{" "}
                    {(storageData?.glacierVideoCount ?? 0).toLocaleString()}{" "}
                    videos
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ${glacierCost.toFixed(4)}/mo · ₱
                    {convertUsdToPhp(glacierCost).toFixed(2)}/mo
                    <span className="text-xs text-muted-foreground/60 ml-1">
                      ($0.0045/GB)
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Restore Requests Summary */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <RotateCcw className="size-5" />
                    Restore Requests
                  </CardTitle>
                  <CardDescription>
                    Summary of your Glacier restore requests
                  </CardDescription>
                </div>
                <Button variant="outline" asChild>
                  <Link href="/restore-requests">View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-4 rounded-lg bg-secondary p-4">
                  <div className="flex size-10 items-center justify-center rounded-full bg-chart-4/20">
                    <Clock className="size-5 text-chart-4" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{pendingCount}</p>
                    <p className="text-sm text-muted-foreground">Pending</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-lg bg-secondary p-4">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/20">
                    <TrendingUp className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{completedCount}</p>
                    <p className="text-sm text-muted-foreground">Completed</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-lg bg-secondary p-4">
                  <div className="flex size-10 items-center justify-center rounded-full bg-chart-5/20">
                    <RotateCcw className="size-5 text-chart-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Last Request</p>
                    <p className="text-sm text-muted-foreground">
                      {lastRequestLabel}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Retrieval Cost Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Retrieval Cost Breakdown</CardTitle>
              <CardDescription>
                {totalRequests} total request{totalRequests !== 1 ? "s" : ""} ·
                ₱{convertUsdToPhp(totalRetrievalCost).toFixed(2)} ($
                {totalRetrievalCost.toFixed(4)})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {["EXPEDITED", "STANDARD", "BULK"].map((tier) => {
                  const count = requestsByTier[tier] ?? 0;
                  const cost = costByTier[tier as keyof typeof costByTier] ?? 0;
                  const info = TIER_INFO[tier];
                  const tierBytes =
                    storageData?.retrievalSizeByTier?.[tier] ?? 0;
                  return (
                    <div
                      key={tier}
                      className="flex justify-between items-center"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium">{tier}</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
                                aria-label={`Info for ${tier} tier`}
                              >
                                <InfoIcon className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="right"
                              className="max-w-56 space-y-1 p-3"
                            >
                              <p className="font-medium">{tier} Tier</p>
                              <p>{info.speed}</p>
                              <p>{info.cost}</p>
                              <p>
                                ₱{convertUsdToPhp(cost).toFixed(2)} ($
                                {cost.toFixed(4)}) total
                              </p>
                              <p>{formatStorage(tierBytes)} retrieved</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {count.toLocaleString()} request
                          {count !== 1 ? "s" : ""} · {info.speed}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          ₱{convertUsdToPhp(cost).toFixed(2)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          ${cost.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Total Cost Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Total Estimated Cost</CardTitle>
              <CardDescription>Estimated monthly total</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-4xl font-bold">
                  ₱{convertUsdToPhp(totalCost).toFixed(2)}
                  <span className="text-xl text-muted-foreground ml-2">
                    ${totalCost.toFixed(4)}/mo
                  </span>
                </p>
                <div className="grid gap-2 sm:grid-cols-2 text-sm text-muted-foreground">
                  <p>
                    Standard: ${standardCost.toFixed(4)} · ₱
                    {convertUsdToPhp(standardCost).toFixed(2)}/mo
                  </p>
                  <p>
                    Glacier: ${glacierCost.toFixed(4)} · ₱
                    {convertUsdToPhp(glacierCost).toFixed(2)}/mo
                  </p>
                  <p>
                    Thumbnails: ${thumbnailCost.toFixed(4)} · ₱
                    {convertUsdToPhp(thumbnailCost).toFixed(2)}/mo
                  </p>
                  <p>
                    Transition: ${transitionCost.toFixed(4)} · ₱
                    {convertUsdToPhp(transitionCost).toFixed(2)} one-time
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
