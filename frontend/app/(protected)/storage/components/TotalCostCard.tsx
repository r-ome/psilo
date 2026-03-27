import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { convertUsdToPhp } from "@/app/lib/utils";

interface TotalCostCardProps {
  totalCost: number;
  standardCost: number;
  glacierCost: number;
  thumbnailCost: number;
  transitionCost: number;
}

export function TotalCostCard({
  totalCost,
  standardCost,
  glacierCost,
  thumbnailCost,
  transitionCost,
}: TotalCostCardProps) {
  return (
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
  );
}
