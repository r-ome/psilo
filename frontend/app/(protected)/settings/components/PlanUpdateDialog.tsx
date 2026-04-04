"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Badge } from "@/app/components/ui/badge";
import { formatStorage } from "@/app/lib/utils";
import {
  TIERS,
  MANAGEABLE_TIERS,
  type ManageableTierName,
  type TierName,
} from "@/app/lib/tiers";
import { userService } from "@/app/lib/services/user.service";
import type { UserProfile } from "@/app/lib/services/user.service";

interface PlanUpdateDialogProps {
  profile: UserProfile;
  onProfileUpdated: (profile: UserProfile) => void;
}

const PLAN_ORDER = MANAGEABLE_TIERS;

function formatMonthlyPrice(plan: ManageableTierName): string {
  const price = TIERS[plan].monthlyPrice;
  return price === 0 ? "Free" : `$${price.toFixed(2)}/mo`;
}

function formatCurrentPrice(plan: TierName): string {
  const price = TIERS[plan].monthlyPrice;
  if (price == null) return "Pay-per-GB";
  return price === 0 ? "Free" : `$${price.toFixed(2)}/mo`;
}

export function PlanUpdateDialog({
  profile,
  onProfileUpdated,
}: PlanUpdateDialogProps) {
  const initialPlan = useMemo(() => {
    return PLAN_ORDER.includes(profile.plan as ManageableTierName)
      ? (profile.plan as ManageableTierName)
      : "standard";
  }, [profile.plan]);

  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<ManageableTierName>(initialPlan);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedPlan(initialPlan);
    }
  }, [initialPlan, open]);

  const currentPlan: TierName = profile.plan in TIERS
    ? (profile.plan as TierName)
    : "standard";
  const currentTier = TIERS[currentPlan];
  const selectedTier = TIERS[selectedPlan];
  const hasChange = selectedPlan !== profile.plan;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await userService.updatePlan(selectedPlan);
      onProfileUpdated(updated);
      toast.success(`Plan updated to ${selectedTier.label}`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Change plan</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Update your plan</DialogTitle>
          <DialogDescription>
            This changes the `users` row directly. No billing integration is wired up yet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Current plan
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="secondary">{currentTier.label}</Badge>
                <span className="text-sm text-muted-foreground">
                  {formatCurrentPrice(currentPlan)}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {currentTier.limitGB == null
                  ? "No fixed limit"
                  : `${formatStorage(profile.storageLimitBytes)} limit`}
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Selected plan
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge>{selectedTier.label}</Badge>
                <span className="text-sm text-muted-foreground">
                  {formatMonthlyPrice(selectedPlan)}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {selectedTier.limitGB?.toLocaleString()} GB limit
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Plan</label>
            <Select
              value={selectedPlan}
              onValueChange={(value) => setSelectedPlan(value as ManageableTierName)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a plan" />
              </SelectTrigger>
              <SelectContent>
                {PLAN_ORDER.map((plan) => {
                  const tier = TIERS[plan];
                  return (
                    <SelectItem key={plan} value={plan}>
                      <span>
                        {tier.label} · {tier.limitGB?.toLocaleString()} GB
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <p className="text-sm text-muted-foreground">
            Use `standard` if you want the 1 TB tier for your personal storage test.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasChange}>
            {saving && <Loader2Icon className="size-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
