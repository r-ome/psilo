import { HardDrive } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatStorage, convertUsdToPhp } from "@/app/lib/utils";
import { StorageSize } from "@/app/lib/services/photo.service";
import { StorageProgressBar } from "./StorageProgressBar";

interface StorageOverviewCardProps {
  storageData: StorageSize;
  standardSizeGB: number;
  glacierSizeGB: number;
  totalSizeGB: number;
  totalCost: number;
}

export function StorageOverviewCard({
  storageData,
  standardSizeGB,
  glacierSizeGB,
  totalSizeGB,
  totalCost,
}: StorageOverviewCardProps) {
  return (
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
                  (storageData.standardSize ?? 0) +
                    (storageData.glacierSize ?? 0) +
                    (storageData.thumbnailSize ?? 0),
                )}
              </span>
            </div>
          </div>
          <StorageProgressBar
            standardSizeGB={standardSizeGB}
            glacierSizeGB={glacierSizeGB}
            totalSizeGB={totalSizeGB}
          />
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="size-3 rounded-full bg-primary" />
              <span>
                Standard: {formatStorage(storageData.standardSize ?? 0)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-3 rounded-full bg-chart-2" />
              <span>
                Glacier: {formatStorage(storageData.glacierSize ?? 0)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-3 rounded-full bg-muted-foreground/30" />
              <span>
                Thumbnails: {formatStorage(storageData.thumbnailSize ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
