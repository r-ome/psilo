import { z } from "zod";
import { MANAGEABLE_TIERS, type ManageableTierName } from "@/app/lib/tiers";

export const updatePlanSchema = z.object({
  plan: z.string().refine(
    (value): value is ManageableTierName =>
      (MANAGEABLE_TIERS as readonly string[]).includes(value),
    { message: "Invalid plan" },
  ),
});

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
