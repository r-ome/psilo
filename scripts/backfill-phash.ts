/**
 * Backfill pHash for photos that have a thumbnailKey but no phash.
 *
 * Usage:
 *   DB_CLUSTER_ARN=... DB_SECRET_ARN=... DB_NAME=psilo \
 *   AWS_REGION=ap-southeast-1 BUCKET_NAME=... \
 *   npx ts-node --project scripts/tsconfig.json scripts/backfill-phash.ts
 */
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { eq, isNull, isNotNull, and } from "drizzle-orm";
import { createDb } from "../services/shared/db";
import { photos } from "../services/shared/schema";
import { computePHash } from "../services/shared/phash";

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.BUCKET_NAME!;
const BATCH_SIZE = 50;

async function downloadBuffer(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function main() {
  const db = createDb();
  let offset = 0;
  let processed = 0;
  let failed = 0;

  console.log("Starting pHash backfill...");

  while (true) {
    const batch = await db
      .select({ id: photos.id, thumbnailKey: photos.thumbnailKey, s3Key: photos.s3Key })
      .from(photos)
      .where(and(isNull(photos.phash), isNotNull(photos.thumbnailKey)))
      .limit(BATCH_SIZE)
      .offset(offset);

    if (batch.length === 0) break;

    for (const photo of batch) {
      try {
        const buffer = await downloadBuffer(photo.thumbnailKey!);
        const phash = await computePHash(buffer);
        await db.update(photos).set({ phash }).where(eq(photos.id, photo.id));
        processed++;
        if (processed % 100 === 0) {
          console.log(`Processed ${processed} photos...`);
        }
      } catch (err) {
        console.error(`Failed to compute pHash for ${photo.s3Key}:`, err);
        failed++;
      }
    }

    offset += BATCH_SIZE;
  }

  console.log(`Done. Processed: ${processed}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
