import "server-only";
import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_COGNITO_USER_POOL_ID: z.string().min(1),
  NEXT_PUBLIC_COGNITO_APP_CLIENT_ID: z.string().min(1),
  COGNITO_CLIENT_SECRET: z.string().min(1),
  COGNITO_ISSUER: z.string().min(1),
  AWS_REGION: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Missing Env Variables", parsed.error.format());
  throw new Error("Invalid Environment Variables");
}

export const env = parsed.data;
