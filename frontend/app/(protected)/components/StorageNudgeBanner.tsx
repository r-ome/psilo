"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { TierName, TIERS } from "@/app/lib/tiers";

interface StorageNudgeBannerProps {
  plan: string;
  usageBytes: number;
  limitBytes: number;
}

const NUDGE_THRESHOLD: Record<string, number> = {
  free: 0.8,
  basic: 0.8,
  standard: 0.8,
  premium: 0.9,
};

const UPGRADE_MESSAGES: Record<string, string> = {
  free: "Upgrade to Basic for 200 GB at $2.49/mo",
  basic: "5x your storage for just $5 more/mo — upgrade to Standard",
  standard: "Double your storage for just $6 more/mo — upgrade to Premium",
  premium: "Contact us for a custom plan",
};

export function getNudgeThreshold(plan: string): number | null {
  return NUDGE_THRESHOLD[plan] ?? null;
}

export function shouldShowNudge(
  plan: string,
  usageBytes: number,
  limitBytes: number,
): boolean {
  if (plan === "on_demand") return false;
  const threshold = getNudgeThreshold(plan);
  if (threshold == null) return false;
  return usageBytes / limitBytes >= threshold;
}

export function StorageNudgeBanner({
  plan,
  usageBytes,
  limitBytes,
}: StorageNudgeBannerProps) {
  if (!shouldShowNudge(plan, usageBytes, limitBytes)) return null;

  const tierInfo = TIERS[plan as TierName];
  const usagePercent = Math.round((usageBytes / limitBytes) * 100);
  const message = UPGRADE_MESSAGES[plan] ?? "Upgrade your plan for more storage";
  const showUpgradeLink = plan !== "premium";

  return (
    <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-500" />
      <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
        <p className="text-foreground">
          <span className="font-medium">
            {tierInfo?.label ?? plan} storage {usagePercent}% full.
          </span>{" "}
          {message}
        </p>
        {showUpgradeLink && (
          <Button size="sm" variant="outline" className="shrink-0 border-yellow-500/50 hover:bg-yellow-500/10" asChild>
            <Link href="/#pricing">Upgrade</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
