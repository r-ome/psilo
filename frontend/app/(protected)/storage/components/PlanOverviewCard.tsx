import Link from "next/link";
import { CreditCard } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Progress } from "@/app/components/ui/progress";
import {
  TIERS,
  TierName,
  calculateOnDemandCost,
  calculatePlanSavingsVsOnDemand,
} from "@/app/lib/tiers";
import { UserProfile } from "@/app/lib/services/user.service";

interface PlanOverviewCardProps {
  userProfile: UserProfile;
  standardSizeGB: number;
  glacierSizeGB: number;
  glacierCost: number;
  thumbnailCost: number;
  transitionCost: number;
}

const PAID_UPGRADE_TIERS: TierName[] = ["basic", "standard", "premium"];

export function PlanOverviewCard({
  userProfile,
  standardSizeGB,
  glacierSizeGB,
  glacierCost,
  thumbnailCost,
  transitionCost,
}: PlanOverviewCardProps) {
  const plan = (userProfile.plan as TierName) in TIERS ? (userProfile.plan as TierName) : "free";
  const tier = TIERS[plan];

  const usageGB = standardSizeGB + glacierSizeGB;
  const limitGB = tier.limitGB;
  const usagePercent = limitGB ? Math.min((usageGB / limitGB) * 100, 100) : 0;

  const planCost = tier.monthlyPrice ?? 0;
  const isFreePlan = plan === "free";
  const isOnDemand = plan === "on_demand";

  const savings = calculatePlanSavingsVsOnDemand(plan, usageGB);
  const onDemandCostAtUsage = calculateOnDemandCost(usageGB);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-5" />
              Your Plan
            </CardTitle>
            <CardDescription>
              {isOnDemand
                ? "Pay-per-GB · no storage cap"
                : isFreePlan
                  ? "Free · 5 GB included"
                  : `$${planCost.toFixed(2)}/mo · ${limitGB} GB included`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={isFreePlan ? "secondary" : "default"}>
              {tier.label}
            </Badge>
            <Button size="sm" variant="outline" asChild>
              <Link href="/#pricing">
                {isFreePlan ? "Upgrade Now" : "Manage Plan"}
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Usage bar */}
        {!isOnDemand && limitGB ? (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{usageGB.toFixed(2)} GB used</span>
              <span className="text-muted-foreground">
                {limitGB} GB limit ({usagePercent.toFixed(0)}%)
              </span>
            </div>
            <Progress value={usagePercent} />
          </div>
        ) : isOnDemand ? (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Current usage</p>
            <p className="text-lg font-semibold">{usageGB.toFixed(2)} GB</p>
          </div>
        ) : null}

        {/* Monthly cost breakdown */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Monthly breakdown</p>
          <div className="rounded-md border border-border divide-y divide-border text-sm">
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Plan subscription</span>
              <span className="font-medium">
                {isOnDemand
                  ? `$${onDemandCostAtUsage.toFixed(2)}/mo`
                  : planCost === 0
                    ? "Free"
                    : `$${planCost.toFixed(2)}/mo`}
              </span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Glacier storage</span>
              <span className="font-medium">${glacierCost.toFixed(4)}/mo</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Thumbnail storage</span>
              <span className="font-medium">${thumbnailCost.toFixed(4)}/mo</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">
                Processing (one-time)
              </span>
              <span className="font-medium">${transitionCost.toFixed(4)}</span>
            </div>
          </div>
        </div>

        {/* Free users: upgrade comparison table */}
        {isFreePlan && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Upgrade options</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {PAID_UPGRADE_TIERS.map((tierKey) => {
                const t = TIERS[tierKey];
                return (
                  <div
                    key={tierKey}
                    className="rounded-md border border-border p-3 text-sm space-y-1"
                  >
                    <p className="font-medium">{t.label}</p>
                    <p className="text-primary font-bold">
                      ${(t.monthlyPrice as number).toFixed(2)}/mo
                    </p>
                    <p className="text-muted-foreground">{t.limitGB} GB</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Paid users: savings vs On-Demand */}
        {!isFreePlan && !isOnDemand && savings !== null && savings > 0 && (
          <div className="rounded-md bg-primary/5 border border-primary/20 px-4 py-3 text-sm space-y-0.5">
            <p className="font-medium text-primary">
              You save ${savings.toFixed(2)}/mo vs On-Demand
            </p>
            <p className="text-muted-foreground">
              On-Demand at {usageGB.toFixed(1)} GB would cost $
              {onDemandCostAtUsage.toFixed(2)}/mo
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
