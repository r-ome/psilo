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
import { eq, and, inArray } from "drizzle-orm";
import { createDb } from "../../shared/db";
import { photos } from "../../shared/schema";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;

function respond(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/**
 * Parses the S3 Restore header to determine if a restored copy is available.
 * Header format: `ongoing-request="false", expiry-date="..."` (restored)
 *                `ongoing-request="true"` (in progress)
 */
function isRestoredCopyAvailable(restore: string | undefined): boolean {
  if (!restore) return false;
  return restore.includes('ongoing-request="false"');
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const sub = event.requestContext.authorizer.jwt.claims["sub"] as string;

  let body: { keys?: string[]; tier?: string };
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return respond(400, { message: "Invalid JSON body" });
  }

  const { keys, tier = "Standard" } = body;

  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    return respond(400, { message: "keys array is required" });
  }

  const db = createDb();

  // Verify ownership: all keys must belong to the authenticated user
  const dbPhotos = await db
    .select()
    .from(photos)
    .where(and(inArray(photos.s3Key, keys), eq(photos.userId, sub)));

  if (dbPhotos.length !== keys.length) {
    return respond(403, { message: "Forbidden" });
  }

  const standardUrls: { key: string; url: string }[] = [];
  let glacierInitiated = false;
  let glacierAlreadyInProgress = false;

  await Promise.all(
    dbPhotos.map(async (photo) => {
      // Always check the real S3 state — the DB storageClass may lag behind
      // if the EventBridge lifecycle-transition event hasn't fired yet.
      const head = await s3.send(
        new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: photo.s3Key }),
      );

      const actualStorageClass = head.StorageClass ?? "STANDARD";
      const isGlacier =
        actualStorageClass === "GLACIER" ||
        actualStorageClass === "DEEP_ARCHIVE";

      if (!isGlacier || isRestoredCopyAvailable(head.Restore)) {
        // Either genuinely STANDARD, or a Glacier restore has already completed
        // and a temporary copy is available — serve a presigned URL.
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
        // Object is in Glacier and not yet restored — initiate a restore.
        try {
          await s3.send(
            new RestoreObjectCommand({
              Bucket: BUCKET_NAME,
              Key: photo.s3Key,
              RestoreRequest: {
                Days: 7,
                GlacierJobParameters: {
                  Tier: tier as "Expedited" | "Standard" | "Bulk",
                },
              },
            }),
          );
          glacierInitiated = true;
        } catch (err: unknown) {
          if (
            err &&
            typeof err === "object" &&
            "name" in err &&
            err.name === "RestoreAlreadyInProgress"
          ) {
            glacierAlreadyInProgress = true;
          } else {
            throw err;
          }
        }
      }
    }),
  );

  return respond(200, { standardUrls, glacierInitiated, glacierAlreadyInProgress });
};
