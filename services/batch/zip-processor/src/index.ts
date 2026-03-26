import archiver from "archiver";
import { PassThrough, Readable } from "stream";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq, inArray } from "drizzle-orm";
import { createDb } from "../../../shared/db";
import { retrievalBatches, retrievalRequests } from "../../../shared/schema";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;
const ZIP_BUCKET_NAME = process.env.ZIP_BUCKET_NAME!;
const BATCH_ID = process.env.BATCH_ID!;

async function main() {
  const db = createDb();

  // Idempotency guard
  const [batch] = await db
    .select()
    .from(retrievalBatches)
    .where(eq(retrievalBatches.id, BATCH_ID))
    .limit(1);

  if (!batch || batch.status !== "ZIPPING") {
    console.log(
      `Batch ${BATCH_ID} status is '${batch?.status}', exiting.`,
    );
    process.exit(0);
  }

  const requests = await db
    .select()
    .from(retrievalRequests)
    .where(eq(retrievalRequests.batchId, BATCH_ID));

  const passThrough = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 0 } });
  archive.on("error", (err) => {
    throw err;
  });
  archive.pipe(passThrough);

  const zipKey = `batches/${BATCH_ID}.zip`;
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: ZIP_BUCKET_NAME,
      Key: zipKey,
      Body: passThrough,
      ContentType: "application/zip",
    },
    queueSize: 4,
    partSize: 10 * 1024 * 1024,
  });

  const failedIds: string[] = [];

  try {
    for (const req of requests) {
      try {
        const { Body } = await s3.send(
          new GetObjectCommand({ Bucket: BUCKET_NAME, Key: req.s3Key }),
        );
        const filename = req.s3Key.split("/").pop() ?? req.s3Key;
        archive.append(Body as Readable, { name: filename });
      } catch (err) {
        console.error(`Failed to fetch ${req.s3Key}:`, err);
        failedIds.push(req.id);
        await db
          .update(retrievalRequests)
          .set({ status: "FAILED" })
          .where(eq(retrievalRequests.id, req.id));
      }
    }

    archive.finalize();
    await upload.done();

    // Generate presigned URL (1-hour expiry)
    const RETENTION_SECONDS = 7 * 24 * 3600;
    const presignedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: ZIP_BUCKET_NAME, Key: zipKey }),
      { expiresIn: RETENTION_SECONDS },
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + RETENTION_SECONDS * 1000);

    // Update successful requests with the presigned URL and expiry
    const successfulIds = requests
      .filter((r) => !failedIds.includes(r.id))
      .map((r) => r.id);
    if (successfulIds.length > 0) {
      await db
        .update(retrievalRequests)
        .set({ retrievalLink: presignedUrl, expiresAt })
        .where(inArray(retrievalRequests.id, successfulIds));
    }

    const finalStatus = failedIds.length > 0 ? "PARTIAL_FAILURE" : "COMPLETED";

    await db
      .update(retrievalBatches)
      .set({ status: finalStatus, availableAt: now, expiresAt })
      .where(eq(retrievalBatches.id, BATCH_ID));

    console.log(
      `Batch ${BATCH_ID} ${finalStatus}. Zip: s3://${ZIP_BUCKET_NAME}/${zipKey}`,
    );
  } catch (err) {
    console.error("Zip task failed:", err);
    await db
      .update(retrievalBatches)
      .set({ status: "FAILED" })
      .where(eq(retrievalBatches.id, BATCH_ID));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
