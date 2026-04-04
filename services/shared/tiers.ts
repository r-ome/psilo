export const TIERS = {
  free:      { limitGB: 5,    limitBytes: 5_368_709_120,     label: "Free",      monthlyPrice: 0 },
  on_demand: { limitGB: null, limitBytes: null,              label: "On-Demand", monthlyPrice: null },
  basic:     { limitGB: 200,  limitBytes: 214_748_364_800,   label: "Basic",     monthlyPrice: 2.49 },
  standard:  { limitGB: 1000, limitBytes: 1_099_511_627_776, label: "Standard",  monthlyPrice: 7.49 },
  premium:   { limitGB: 2000, limitBytes: 2_199_023_255_552, label: "Premium",   monthlyPrice: 13.49 },
} as const;

export type TierName = keyof typeof TIERS;
export const MANAGEABLE_TIERS = ["free", "basic", "standard", "premium"] as const;
export type ManageableTierName = typeof MANAGEABLE_TIERS[number];
