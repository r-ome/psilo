import { shouldShowNudge, getNudgeThreshold } from "@/app/(protected)/components/StorageNudgeBanner";

describe("getNudgeThreshold", () => {
  it("returns 0.8 for free plan", () => {
    expect(getNudgeThreshold("free")).toBe(0.8);
  });

  it("returns 0.8 for basic plan", () => {
    expect(getNudgeThreshold("basic")).toBe(0.8);
  });

  it("returns 0.8 for standard plan", () => {
    expect(getNudgeThreshold("standard")).toBe(0.8);
  });

  it("returns 0.9 for premium plan", () => {
    expect(getNudgeThreshold("premium")).toBe(0.9);
  });

  it("returns null for on_demand plan", () => {
    expect(getNudgeThreshold("on_demand")).toBeNull();
  });

  it("returns null for unknown plan", () => {
    expect(getNudgeThreshold("unknown")).toBeNull();
  });
});

describe("shouldShowNudge", () => {
  describe("free plan (80% threshold)", () => {
    it("shows nudge when exactly at 80%", () => {
      const limit = 5_368_709_120; // 5 GB
      expect(shouldShowNudge("free", limit * 0.8, limit)).toBe(true);
    });

    it("shows nudge when above 80%", () => {
      const limit = 5_368_709_120;
      expect(shouldShowNudge("free", limit * 0.95, limit)).toBe(true);
    });

    it("does not show nudge when below 80%", () => {
      const limit = 5_368_709_120;
      expect(shouldShowNudge("free", limit * 0.79, limit)).toBe(false);
    });

    it("shows nudge at 100% (full)", () => {
      const limit = 5_368_709_120;
      expect(shouldShowNudge("free", limit, limit)).toBe(true);
    });
  });

  describe("basic plan (80% threshold)", () => {
    it("shows nudge at 80%", () => {
      const limit = 214_748_364_800; // 200 GB
      expect(shouldShowNudge("basic", limit * 0.8, limit)).toBe(true);
    });

    it("does not show nudge below 80%", () => {
      const limit = 214_748_364_800;
      expect(shouldShowNudge("basic", limit * 0.5, limit)).toBe(false);
    });
  });

  describe("standard plan (80% threshold)", () => {
    it("shows nudge at 80%", () => {
      const limit = 1_073_741_824_000; // 1 TB
      expect(shouldShowNudge("standard", limit * 0.8, limit)).toBe(true);
    });

    it("does not show nudge below 80%", () => {
      const limit = 1_073_741_824_000;
      expect(shouldShowNudge("standard", limit * 0.79, limit)).toBe(false);
    });
  });

  describe("premium plan (90% threshold)", () => {
    it("shows nudge at exactly 90%", () => {
      const limit = 2_147_483_648_000; // 2 TB
      expect(shouldShowNudge("premium", limit * 0.9, limit)).toBe(true);
    });

    it("does not show nudge at 80% (below premium threshold)", () => {
      const limit = 2_147_483_648_000;
      expect(shouldShowNudge("premium", limit * 0.8, limit)).toBe(false);
    });

    it("shows nudge above 90%", () => {
      const limit = 2_147_483_648_000;
      expect(shouldShowNudge("premium", limit * 0.95, limit)).toBe(true);
    });
  });

  describe("on_demand plan", () => {
    it("never shows nudge regardless of usage", () => {
      expect(shouldShowNudge("on_demand", 999_999_999_999, 1)).toBe(false);
    });
  });

  describe("unknown plan", () => {
    it("does not show nudge for unknown plan", () => {
      expect(shouldShowNudge("unknown", 999_999, 1_000_000)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("does not show nudge at 0% usage", () => {
      expect(shouldShowNudge("free", 0, 5_368_709_120)).toBe(false);
    });
  });
});
