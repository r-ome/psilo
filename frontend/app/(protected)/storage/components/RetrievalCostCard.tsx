import { InfoIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";
import { formatStorage, convertUsdToPhp } from "@/app/lib/utils";
import { StorageSize } from "@/app/lib/services/photo.service";
import { RetrievalBatch } from "@/app/lib/services/retrieval.service";

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
    speed: "1-5 minutes",
    cost: "$0.03/GB + $0.01/1,000 requests",
    costUsdPerGB: 0.03,
    costUsdPer1000Req: 0.01,
  },
  STANDARD: {
    speed: "3-5 hours",
    cost: "$0.01/GB + $0.05/1,000 requests",
    costUsdPerGB: 0.01,
    costUsdPer1000Req: 0.05,
  },
  BULK: {
    speed: "5-12 hours",
    cost: "$0.025/1,000 requests",
    costUsdPerGB: 0,
    costUsdPer1000Req: 0.025,
  },
};

interface RetrievalCostCardProps {
  storageData: StorageSize;
  batches: RetrievalBatch[];
}

export function RetrievalCostCard({
  storageData,
  batches,
}: RetrievalCostCardProps) {
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
      (storageData.retrievalSizeByTier?.["EXPEDITED"] ?? 0) / 1024 ** 3,
    STANDARD:
      (storageData.retrievalSizeByTier?.["STANDARD"] ?? 0) / 1024 ** 3,
    BULK: (storageData.retrievalSizeByTier?.["BULK"] ?? 0) / 1024 ** 3,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retrieval Cost Breakdown</CardTitle>
        <CardDescription>
          {totalRequests} total request{totalRequests !== 1 ? "s" : ""} · ₱
          {convertUsdToPhp(totalRetrievalCost).toFixed(2)} ($
          {totalRetrievalCost.toFixed(4)})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {(["EXPEDITED", "STANDARD", "BULK"] as const).map((tier) => {
            const count = requestsByTier[tier] ?? 0;
            const cost = costByTier[tier];
            const info = TIER_INFO[tier];
            const tierBytes =
              storageData.retrievalSizeByTier?.[tier] ?? 0;
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
  );
}
