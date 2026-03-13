import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { and, inArray, isNotNull, lte } from "drizzle-orm";
import { createDb } from "../../shared/db";
import { photos } from "../../shared/schema";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;
const RETENTION_DAYS = 30;
const S3_BATCH_SIZE = 1000;
const DB_BATCH_SIZE = 500;

export const handler = async (): Promise<void> => {
  const db = createDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const expired = await db
    .select({
      id: photos.id,
      s3Key: photos.s3Key,
      thumbnailKey: photos.thumbnailKey,
    })
    .from(photos)
    .where(and(isNotNull(photos.deletedAt), lte(photos.deletedAt, cutoff)));

  if (expired.length === 0) {
    console.log("No expired photos to purge.");
    return;
  }

  const allKeys: string[] = [];
  for (const p of expired) {
    allKeys.push(p.s3Key);
    if (p.thumbnailKey) allKeys.push(p.thumbnailKey);
  }

  // Batch S3 deletions (max 1000 per call)
  for (let i = 0; i < allKeys.length; i += S3_BATCH_SIZE) {
    const batch = allKeys.slice(i, i + S3_BATCH_SIZE);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET_NAME,
        Delete: { Objects: batch.map((Key) => ({ Key })) },
      }),
    );
  }

  // Batch DB deletes
  const ids = expired.map((p) => p.id);
  for (let i = 0; i < ids.length; i += DB_BATCH_SIZE) {
    await db
      .delete(photos)
      .where(inArray(photos.id, ids.slice(i, i + DB_BATCH_SIZE)));
  }

  console.log(
    `Purged ${expired.length} photos. S3 objects deleted: ${allKeys.length}.`,
  );
};
