export const TIERS = {
  free:      { limitGB: 5,    limitBytes: 5_368_709_120,     label: "Free",      monthlyPrice: 0 },
  on_demand: { limitGB: null, limitBytes: null,              label: "On-Demand", monthlyPrice: null },
  basic:     { limitGB: 200,  limitBytes: 214_748_364_800,   label: "Basic",     monthlyPrice: 2.49 },
  standard:  { limitGB: 1000, limitBytes: 1_099_511_627_776, label: "Standard",  monthlyPrice: 7.49 },
  premium:   { limitGB: 2000, limitBytes: 2_199_023_255_552, label: "Premium",   monthlyPrice: 13.49 },
} as const;

export type TierName = keyof typeof TIERS;

export const ON_DEMAND_RATE_PER_GB = 0.015;
export const ON_DEMAND_MIN_GB = 200;

/** Cost on the On-Demand plan for a given usage, applying the 200 GB minimum. */
export function calculateOnDemandCost(usageGB: number): number {
  return Math.max(usageGB, ON_DEMAND_MIN_GB) * ON_DEMAND_RATE_PER_GB;
}

/**
 * How much a user saves per month on their fixed plan vs what they'd pay on On-Demand.
 * Returns null for on_demand (no comparison) or when the plan has no monthly price.
 */
export function calculatePlanSavingsVsOnDemand(plan: TierName, usageGB: number): number | null {
  if (plan === "on_demand") return null;
  const tierPrice = TIERS[plan].monthlyPrice;
  if (tierPrice === null) return null;
  return calculateOnDemandCost(usageGB) - tierPrice;
}
