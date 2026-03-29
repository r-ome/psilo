import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { createDb } from "../../shared/db";
import { photos, users } from "../../shared/schema";
import { computePHash, hammingDistance } from "../../shared/phash";
import { getPrivateKey, cfSignedUrl } from "../../shared/cloudfront";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;
const PHASH_THRESHOLD = 10;

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const claims = event.requestContext.authorizer.jwt.claims;
  const userId = claims.sub as string;
  const givenName = (claims.given_name as string) ?? '';
  const familyName = (claims.family_name as string) ?? '';
  const body = JSON.parse(event.body ?? "{}");
  const { filename, contentType, imageData, contentLength } = body;

  if (!filename || !contentType) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "filename and contentType are required",
      }),
    };
  }

  // Quota enforcement
  const db = createDb();
  const [userRow] = await db
    .select({ plan: users.plan, storageLimitBytes: users.storageLimitBytes })
    .from(users)
    .where(eq(users.id, userId));

  if (userRow && userRow.plan !== "on_demand" && userRow.storageLimitBytes != null) {
    const [usageRow] = await db
      .select({ totalBytes: sql<number>`COALESCE(SUM(${photos.size}), 0)` })
      .from(photos)
      .where(and(eq(photos.userId, userId), isNull(photos.deletedAt)));

    const currentUsageBytes = Number(usageRow?.totalBytes ?? 0);
    const incomingBytes = Number(contentLength ?? 0);

    if (currentUsageBytes + incomingBytes > userRow.storageLimitBytes) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "quota_exceeded",
          currentUsageBytes,
          limitBytes: userRow.storageLimitBytes,
          plan: userRow.plan,
        }),
      };
    }
  }

  // pHash duplicate check for images
  if (imageData && contentType.startsWith("image/")) {
    try {
      const imageBuffer = Buffer.from(imageData, "base64");
      const incomingHash = await computePHash(imageBuffer);

      const existingPhotos = await db
        .select({
          id: photos.id,
          filename: photos.filename,
          thumbnailKey: photos.thumbnailKey,
          s3Key: photos.s3Key,
          phash: photos.phash,
        })
        .from(photos)
        .where(
          and(
            eq(photos.userId, userId),
            isNotNull(photos.phash),
            isNull(photos.deletedAt),
          ),
        );

      const privateKey = await getPrivateKey();
      const matches = await Promise.all(
        existingPhotos
          .filter((p) => {
            const dist = hammingDistance(incomingHash, p.phash!);
            return dist <= PHASH_THRESHOLD;
          })
          .map(async (p) => {
            const dist = hammingDistance(incomingHash, p.phash!);
            const thumbnailUrl = p.thumbnailKey
              ? await cfSignedUrl(p.thumbnailKey, privateKey)
              : null;
            return {
              id: p.id,
              filename: p.filename,
              thumbnailUrl,
              s3Key: p.s3Key,
              distance: dist,
            };
          }),
      );

      if (matches.length > 0) {
        matches.sort((a, b) => a.distance - b.distance);
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "duplicate", duplicates: matches }),
        };
      }
    } catch (err) {
      console.warn("pHash duplicate check failed, proceeding with upload:", err);
    }
  }

  const userPrefix = givenName && familyName
    ? `${givenName}-${familyName}-${userId}`
    : userId;
  const subFolder = contentType.startsWith('video/') ? 'videos' : 'photos';
  const key = `users/${userPrefix}/${subFolder}/${filename}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ok", url, key }),
  };
};
