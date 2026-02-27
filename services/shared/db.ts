import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { drizzle } from 'drizzle-orm/aws-data-api/pg';
import * as schema from './schema';

export function createDb() {
  const client = new RDSDataClient({});
  return drizzle(client, {
    database: process.env.DB_NAME!,
    secretArn: process.env.DB_SECRET_ARN!,
    resourceArn: process.env.DB_CLUSTER_ARN!,
    schema,
  });
}
