import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, '.env.local') });

const client = new RDSDataClient({});

const CLUSTER_ARN = process.env.DB_CLUSTER_ARN!;
const SECRET_ARN = process.env.DB_SECRET_ARN!;
const DATABASE = process.env.DB_NAME!;

async function execute(sql: string) {
  await client.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN,
    secretArn: SECRET_ARN,
    database: DATABASE,
    sql,
  }));
}

async function main() {
  // Drop FK constraints that block inserts when user record doesn't exist yet
  const fixStatements = [
    `ALTER TABLE "photos" DROP CONSTRAINT IF EXISTS "photos_user_id_users_id_fk"`,
    `ALTER TABLE "albums" DROP CONSTRAINT IF EXISTS "albums_user_id_users_id_fk"`,
  ];

  console.log('Removing user FK constraints...');
  for (const sql of fixStatements) {
    console.log(`  → ${sql}`);
    try { await execute(sql); } catch { /* already gone */ }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
