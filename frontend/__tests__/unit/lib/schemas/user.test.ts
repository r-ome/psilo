import { updatePlanSchema } from "@/app/lib/schemas/user";

describe("updatePlanSchema", () => {
  it("accepts manageable tiers", () => {
    expect(updatePlanSchema.safeParse({ plan: "standard" }).success).toBe(true);
    expect(updatePlanSchema.safeParse({ plan: "premium" }).success).toBe(true);
  });

  it("rejects unsupported tiers", () => {
    const result = updatePlanSchema.safeParse({ plan: "on_demand" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Invalid plan");
    }
  });
});
