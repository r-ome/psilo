import { Zap, Snowflake, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { formatStorage, convertUsdToPhp } from "@/app/lib/utils";
import { StorageSize } from "@/app/lib/services/photo.service";

interface StorageTierCardsProps {
  storageData: StorageSize;
  standardCost: number;
  glacierCost: number;
}

export function StorageTierCards({
  storageData,
  standardCost,
  glacierCost,
}: StorageTierCardsProps) {
  return (
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
                  {formatStorage(storageData.standardSize ?? 0)}
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                {(
                  (storageData.standardPhotoCount ?? 0) +
                  (storageData.standardVideoCount ?? 0)
                ).toLocaleString()}{" "}
                files
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              {(storageData.standardPhotoCount ?? 0).toLocaleString()} photos,{" "}
              {(storageData.standardVideoCount ?? 0).toLocaleString()} videos
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
                  {formatStorage(storageData.glacierSize ?? 0)}
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                {(
                  (storageData.glacierPhotoCount ?? 0) +
                  (storageData.glacierVideoCount ?? 0)
                ).toLocaleString()}{" "}
                files
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              {(storageData.glacierPhotoCount ?? 0).toLocaleString()} photos,{" "}
              {(storageData.glacierVideoCount ?? 0).toLocaleString()} videos
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
  );
}
