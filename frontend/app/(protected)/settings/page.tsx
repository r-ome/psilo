"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2Icon, Settings2Icon, ShieldCheckIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { PlanUpdateDialog } from "./components/PlanUpdateDialog";
import { userService, type UserProfile } from "@/app/lib/services/user.service";
import { TIERS, type TierName } from "@/app/lib/tiers";
import { formatStorage } from "@/app/lib/utils";

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        const data = await userService.getProfile();
        if (cancelled) return;
        setProfile(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentTier = useMemo(() => {
    if (!profile) return TIERS.standard;
    return profile.plan in TIERS
      ? TIERS[profile.plan as TierName]
      : TIERS.standard;
  }, [profile]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Update your personal plan and keep the rest of the app unchanged.
          </p>
        </div>
        {profile && <PlanUpdateDialog profile={profile} onProfileUpdated={setProfile} />}
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
      ) : profile ? (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2Icon className="size-5" />
                Account plan
              </CardTitle>
              <CardDescription>
                The current database-backed plan for this account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge>{currentTier.label}</Badge>
                <span className="text-sm text-muted-foreground">
                  {formatStorage(profile.storageLimitBytes)} limit
                </span>
                <span className="text-sm text-muted-foreground">
                  {currentTier.monthlyPrice == null
                    ? "Pay-per-GB"
                    : currentTier.monthlyPrice === 0
                    ? "Free"
                    : `$${currentTier.monthlyPrice?.toFixed(2)}/mo`}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Email
                  </p>
                  <p className="mt-2 text-sm font-medium">{profile.email}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    User ID
                  </p>
                  <p className="mt-2 text-sm font-medium break-all">{profile.id}</p>
                </div>
              </div>

              <div className="rounded-lg border border-dashed p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheckIcon className="size-4 text-primary" />
                  Plan updates stay inside the app
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Changing this plan updates the `users` table directly. It does not
                  talk to any payment provider yet, so this is safe for personal testing.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Available tier</CardTitle>
              <CardDescription>
                Your target tier for the next upload test is probably Standard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium">Standard</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  1 TB limit · ${TIERS.standard.monthlyPrice?.toFixed(2)}/mo
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Good baseline if you want to upload once, leave the app idle, and
                  check the bill next month.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
