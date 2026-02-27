import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: '.env.local' });

export default {
  schema: './shared/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  driver: 'aws-data-api',
  dbCredentials: {
    database: process.env.DB_NAME!,
    secretArn: process.env.DB_SECRET_ARN!,
    resourceArn: process.env.DB_CLUSTER_ARN!,
  },
} satisfies Config;
