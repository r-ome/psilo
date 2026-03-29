"use client";

import { useEffect, useState } from "react";
import { photoService, StorageSize } from "@/app/lib/services/photo.service";
import { userService, UserProfile } from "@/app/lib/services/user.service";
import {
  retrievalService,
  RetrievalBatch,
} from "@/app/lib/services/retrieval.service";
import { Loader2Icon } from "lucide-react";
import { Card, CardContent } from "@/app/components/ui/card";
import { StorageNudgeBanner } from "@/app/(protected)/components/StorageNudgeBanner";
import { PlanOverviewCard } from "./components/PlanOverviewCard";
import { StorageOverviewCard } from "./components/StorageOverviewCard";
import { StorageTierCards } from "./components/StorageTierCards";
import { RestoreRequestsCard } from "./components/RestoreRequestsCard";
import { RetrievalCostCard } from "./components/RetrievalCostCard";
import { TotalCostCard } from "./components/TotalCostCard";

export default function StoragePage() {
  const [storageData, setStorageData] = useState<StorageSize | null>(null);
  const [batches, setBatches] = useState<RetrievalBatch[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setLoading(true);
        const [storageResult, batchesResult, profileResult] = await Promise.all([
          photoService.getStorageSize(),
          retrievalService.listBatches(),
          userService.getProfile().catch(() => null),
        ]);
        if (cancelled) return;
        setStorageData(storageResult);
        setBatches(batchesResult.batches);
        setUserProfile(profileResult);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError("Failed to load storage information");
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
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
          {userProfile && userProfile.plan !== "on_demand" && (
            <StorageNudgeBanner
              plan={userProfile.plan}
              usageBytes={(storageData?.standardSize ?? 0) + (storageData?.glacierSize ?? 0)}
              limitBytes={userProfile.storageLimitBytes}
            />
          )}
          {userProfile && (
            <PlanOverviewCard
              userProfile={userProfile}
              standardSizeGB={standardSizeGB}
              glacierSizeGB={glacierSizeGB}
              glacierCost={glacierCost}
              thumbnailCost={thumbnailCost}
              transitionCost={transitionCost}
            />
          )}
          <StorageOverviewCard
            storageData={storageData!}
            standardSizeGB={standardSizeGB}
            glacierSizeGB={glacierSizeGB}
            totalSizeGB={totalSizeGB}
            totalCost={totalCost}
          />

          <StorageTierCards
            storageData={storageData!}
            standardCost={standardCost}
            glacierCost={glacierCost}
          />

          <RestoreRequestsCard batches={batches} />

          <RetrievalCostCard storageData={storageData!} batches={batches} />

          <TotalCostCard
            totalCost={totalCost}
            standardCost={standardCost}
            glacierCost={glacierCost}
            thumbnailCost={thumbnailCost}
            transitionCost={transitionCost}
          />
        </div>
      )}
    </div>
  );
}
