import {
  TIERS,
  ON_DEMAND_RATE_PER_GB,
  ON_DEMAND_MIN_GB,
  calculateOnDemandCost,
  calculatePlanSavingsVsOnDemand,
} from "@/app/lib/tiers";

describe("TIERS constants", () => {
  it("free tier has 5 GB limit and $0 price", () => {
    expect(TIERS.free.limitGB).toBe(5);
    expect(TIERS.free.monthlyPrice).toBe(0);
  });

  it("on_demand tier has null limit and null price", () => {
    expect(TIERS.on_demand.limitGB).toBeNull();
    expect(TIERS.on_demand.monthlyPrice).toBeNull();
  });

  it("basic tier has 200 GB limit and $2.49 price", () => {
    expect(TIERS.basic.limitGB).toBe(200);
    expect(TIERS.basic.monthlyPrice).toBe(2.49);
  });

  it("standard tier has 1000 GB limit and $7.49 price", () => {
    expect(TIERS.standard.limitGB).toBe(1000);
    expect(TIERS.standard.monthlyPrice).toBe(7.49);
  });

  it("premium tier has 2000 GB limit and $13.49 price", () => {
    expect(TIERS.premium.limitGB).toBe(2000);
    expect(TIERS.premium.monthlyPrice).toBe(13.49);
  });

  it("ON_DEMAND_RATE_PER_GB is $0.015", () => {
    expect(ON_DEMAND_RATE_PER_GB).toBe(0.015);
  });

  it("ON_DEMAND_MIN_GB is 200", () => {
    expect(ON_DEMAND_MIN_GB).toBe(200);
  });
});

describe("calculateOnDemandCost", () => {
  it("uses the 200 GB minimum when usage is below 200 GB", () => {
    expect(calculateOnDemandCost(0)).toBe(200 * 0.015);
    expect(calculateOnDemandCost(1)).toBe(200 * 0.015);
    expect(calculateOnDemandCost(100)).toBe(200 * 0.015);
    expect(calculateOnDemandCost(199)).toBe(200 * 0.015);
  });

  it("uses actual usage when exactly at 200 GB", () => {
    expect(calculateOnDemandCost(200)).toBe(200 * 0.015);
  });

  it("uses actual usage when above 200 GB", () => {
    expect(calculateOnDemandCost(500)).toBeCloseTo(500 * 0.015);
    expect(calculateOnDemandCost(1000)).toBeCloseTo(1000 * 0.015);
    expect(calculateOnDemandCost(2000)).toBeCloseTo(2000 * 0.015);
  });

  it("returns $3.00 minimum at 0 GB usage", () => {
    expect(calculateOnDemandCost(0)).toBe(3.0);
  });

  it("returns $7.50 at 500 GB usage", () => {
    expect(calculateOnDemandCost(500)).toBeCloseTo(7.5);
  });

  it("returns $15.00 at 1000 GB usage", () => {
    expect(calculateOnDemandCost(1000)).toBeCloseTo(15.0);
  });
});

describe("calculatePlanSavingsVsOnDemand", () => {
  describe("on_demand plan", () => {
    it("returns null — no comparison with itself", () => {
      expect(calculatePlanSavingsVsOnDemand("on_demand", 500)).toBeNull();
    });
  });

  describe("free plan", () => {
    it("returns a value (plan price is $0, on-demand at min 200 GB = $3.00)", () => {
      // free plan: $0/mo, on-demand at 0 GB = $3.00, savings = $3.00
      expect(calculatePlanSavingsVsOnDemand("free", 0)).toBeCloseTo(3.0);
    });

    it("savings at 5 GB usage (still uses 200 GB minimum)", () => {
      // on-demand at 5 GB = max(5, 200) * 0.015 = $3.00, savings = $3.00 - $0 = $3.00
      expect(calculatePlanSavingsVsOnDemand("free", 5)).toBeCloseTo(3.0);
    });
  });

  describe("basic plan ($2.49/mo, 200 GB)", () => {
    it("shows positive savings when on-demand would cost more", () => {
      // at 200 GB: on-demand = $3.00, savings = $3.00 - $2.49 = $0.51
      expect(calculatePlanSavingsVsOnDemand("basic", 200)).toBeCloseTo(0.51);
    });

    it("shows negative savings when on-demand would be cheaper (low usage)", () => {
      // at 0 GB: on-demand = $3.00, savings = $3.00 - $2.49 = $0.51 (still positive due to min)
      expect(calculatePlanSavingsVsOnDemand("basic", 0)).toBeCloseTo(0.51);
    });

    it("shows larger savings at high usage", () => {
      // at 200 GB usage with basic: on-demand = $3.00, plan = $2.49, savings = $0.51
      const savings = calculatePlanSavingsVsOnDemand("basic", 200)!;
      expect(savings).toBeGreaterThan(0);
    });
  });

  describe("standard plan ($7.49/mo, 1000 GB)", () => {
    it("shows strong savings at 1 TB usage", () => {
      // at 1000 GB: on-demand = $15.00, savings = $15.00 - $7.49 = $7.51
      expect(calculatePlanSavingsVsOnDemand("standard", 1000)).toBeCloseTo(7.51);
    });

    it("shows savings even at minimum on-demand threshold", () => {
      // at 200 GB: on-demand = $3.00, savings = $3.00 - $7.49 = -$4.49 (negative — plan is more expensive)
      expect(calculatePlanSavingsVsOnDemand("standard", 200)).toBeCloseTo(-4.49);
    });
  });

  describe("premium plan ($13.49/mo, 2000 GB)", () => {
    it("shows strong savings at 2 TB usage", () => {
      // at 2000 GB: on-demand = $30.00, savings = $30.00 - $13.49 = $16.51
      expect(calculatePlanSavingsVsOnDemand("premium", 2000)).toBeCloseTo(16.51);
    });

    it("shows crossover point where savings become positive", () => {
      // breakeven: planCost / 0.015 = 13.49 / 0.015 = ~899.3 GB
      // At 900 GB: on-demand = $13.50, savings = $13.50 - $13.49 = $0.01 (positive)
      expect(calculatePlanSavingsVsOnDemand("premium", 900)).toBeGreaterThan(0);
      // At 899 GB: on-demand = $13.485, savings = $13.485 - $13.49 = negative
      expect(calculatePlanSavingsVsOnDemand("premium", 899)).toBeLessThan(0);
    });
  });
});
