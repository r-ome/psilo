import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  RestoreObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq, and, inArray, not, or, isNull, gt } from "drizzle-orm";
import { createDb } from "../../shared/db";
import {
  photos,
  retrievalBatches,
  retrievalRequests,
} from "../../shared/schema";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;
const RESTORE_RETENTION_DAYS = parseInt(process.env.RESTORE_RETENTION_DAYS ?? "7", 10);

function respond(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function isRestoredCopyAvailable(restore: string | undefined): boolean {
  if (!restore) return false;
  return restore.includes('ongoing-request="false"');
}

export async function initiateBatchRetrieval(
  db: ReturnType<typeof createDb>,
  s3Client: S3Client,
  batchId: string,
): Promise<void> {
  const [batch] = await db
    .select()
    .from(retrievalBatches)
    .where(eq(retrievalBatches.id, batchId))
    .limit(1);

  if (!batch) throw new Error(`Batch not found: ${batchId}`);

  const requests = await db
    .select()
    .from(retrievalRequests)
    .where(
      and(
        eq(retrievalRequests.batchId, batchId),
        eq(retrievalRequests.status, "PENDING"),
      ),
    );

  await Promise.all(
    requests.map(async (req) => {
      try {
        // DB stores tier as uppercase (e.g. "STANDARD") — S3 needs title case ("Standard")
        const tier = batch.retrievalTier.charAt(0) + batch.retrievalTier.slice(1).toLowerCase();
        await s3Client.send(
          new RestoreObjectCommand({
            Bucket: BUCKET_NAME,
            Key: req.s3Key,
            RestoreRequest: {
              Days: RESTORE_RETENTION_DAYS,
              GlacierJobParameters: {
                Tier: tier as "Expedited" | "Standard" | "Bulk",
              },
            },
          }),
        );
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== "RestoreAlreadyInProgress") {
          throw err;
        }
      }
    }),
  );

  const ids = requests.map((r) => r.id);
  if (ids.length > 0) {
    await db
      .update(retrievalRequests)
      .set({ status: "IN_PROGRESS" })
      .where(inArray(retrievalRequests.id, ids));
  }

  await db
    .update(retrievalBatches)
    .set({ status: "IN_PROGRESS" })
    .where(eq(retrievalBatches.id, batchId));
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const sub = event.requestContext.authorizer.jwt.claims["sub"] as string;

  let body: {
    keys?: string[];
    tier?: string;
    albumId?: string;
    batchType?: string;
  };
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return respond(400, { message: "Invalid JSON body" });
  }

  const { keys, tier = "Standard", albumId, batchType } = body;

  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    return respond(400, { message: "keys array is required" });
  }

  const db = createDb();

  // Verify ownership
  const dbPhotos = await db
    .select()
    .from(photos)
    .where(and(inArray(photos.s3Key, keys), eq(photos.userId, sub)));

  if (dbPhotos.length !== keys.length) {
    return respond(403, { message: "Forbidden" });
  }

  // Find keys that already have an active (non-expired, non-failed) retrieval request
  const now = new Date();
  const activeRows = await db
    .select({
      s3Key: retrievalRequests.s3Key,
      batchId: retrievalRequests.batchId,
      batchStatus: retrievalBatches.status,
      retrievalLink: retrievalRequests.retrievalLink,
      expiresAt: retrievalBatches.expiresAt,
    })
    .from(retrievalRequests)
    .innerJoin(retrievalBatches, eq(retrievalRequests.batchId, retrievalBatches.id))
    .where(
      and(
        inArray(retrievalRequests.s3Key, keys),
        eq(retrievalRequests.userId, sub),
        not(inArray(retrievalRequests.status, ["EXPIRED", "FAILED"])),
        not(inArray(retrievalBatches.status, ["EXPIRED", "FAILED"])),
        or(isNull(retrievalBatches.expiresAt), gt(retrievalBatches.expiresAt, now)),
      ),
    );

  const alreadyActiveByKey = new Map(activeRows.map((r) => [r.s3Key, r]));

  const standardUrls: { key: string; url: string }[] = [];
  const glacierPhotosTracking: Array<{ photo: (typeof dbPhotos)[0] }> = [];

  await Promise.all(
    dbPhotos.map(async (photo) => {
      // Skip Glacier restore for keys that already have an active request
      if (alreadyActiveByKey.has(photo.s3Key)) return;

      const head = await s3.send(
        new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: photo.s3Key }),
      );

      const actualStorageClass = head.StorageClass ?? "STANDARD";
      const isGlacier =
        actualStorageClass === "GLACIER" || actualStorageClass === "DEEP_ARCHIVE";

      if (!isGlacier || isRestoredCopyAvailable(head.Restore)) {
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: photo.s3Key,
            ResponseContentDisposition: `attachment; filename="${photo.filename}"`,
          }),
          { expiresIn: 3600 },
        );
        standardUrls.push({ key: photo.s3Key, url });
      } else {
        glacierPhotosTracking.push({ photo });
      }
    }),
  );

  let glacierInitiated = false;
  if (glacierPhotosTracking.length > 0) {
    const detectedBatchType =
      batchType ?? (keys.length === 1 ? "SINGLE" : "MANUAL");
    const tierUppercase = tier.toUpperCase();
    const totalSize = glacierPhotosTracking.reduce(
      (sum, { photo }) => sum + (photo.size ?? 0),
      0,
    );

    const [batch] = await db
      .insert(retrievalBatches)
      .values({
        userId: sub,
        batchType: detectedBatchType,
        sourceId: albumId ?? null,
        retrievalTier: tierUppercase,
        status: "PENDING",
        totalFiles: glacierPhotosTracking.length,
        totalSize,
      })
      .returning();

    await db.insert(retrievalRequests).values(
      glacierPhotosTracking.map(({ photo }) => ({
        batchId: batch.id,
        userId: sub,
        photoId: photo.id,
        s3Key: photo.s3Key,
        fileSize: photo.size ?? 0,
        status: "PENDING",
      })),
    );

    await initiateBatchRetrieval(db, s3, batch.id);
    glacierInitiated = true;
  }

  return respond(200, {
    standardUrls,
    glacierInitiated,
    glacierAlreadyInProgress: false,
    alreadyActive: activeRows.map((r) => ({
      key: r.s3Key,
      batchId: r.batchId,
      batchStatus: r.batchStatus,
      retrievalLink: r.retrievalLink,
      expiresAt: r.expiresAt?.toISOString() ?? null,
    })),
  });
};
