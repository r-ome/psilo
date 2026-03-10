import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq, desc, sql, and, or, lt } from "drizzle-orm";
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

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const sub = event.requestContext.authorizer.jwt.claims["sub"] as string;
  const method = event.requestContext.http.method;

  const db = createDb();

  if (method === "GET") {
    if (event.rawPath?.endsWith("/storage-size")) {
      const result = await db
        .select({
          storageClass: photos.storageClass,
          totalSize: sql<number>`COALESCE(SUM(${photos.size}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(photos)
        .where(eq(photos.userId, sub))
        .groupBy(photos.storageClass);

      let standardSize = 0, glacierSize = 0, standardCount = 0;
      for (const row of result) {
        if (row.storageClass === "STANDARD") {
          standardSize = Number(row.totalSize);
          standardCount = Number(row.count);
        } else if (row.storageClass === "GLACIER") {
          glacierSize = Number(row.totalSize);
        }
      }
      return respond(200, { standardSize, glacierSize, standardCount });
    }

    const cursor = event.queryStringParameters?.cursor;
    const limit =
      Math.min(parseInt(event.queryStringParameters?.limit ?? "10"), 100) || 30;

    let query = db.select().from(photos).where(eq(photos.userId, sub));

    if (cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(cursor, "base64").toString("utf-8"),
        );
        const { sortDate, id: cursorId } = decoded;
        query = db
          .select()
          .from(photos)
          .where(
            and(
              eq(photos.userId, sub),
              or(
                lt(
                  sql`COALESCE(${photos.takenAt}, ${photos.createdAt})`,
                  sql`${sortDate}::timestamp`,
                ),
                and(
                  eq(
                    sql`COALESCE(${photos.takenAt}, ${photos.createdAt})`,
                    sql`${sortDate}::timestamp`,
                  ),
                  lt(photos.id, cursorId),
                ),
              ),
            ),
          );
      } catch {
        return respond(400, { message: "Invalid cursor" });
      }
    }

    const userPhotos = await query
      .orderBy(
        desc(sql`COALESCE(${photos.takenAt}, ${photos.createdAt})`),
        desc(photos.id),
      )
      .limit(limit + 1);

    const hasMore = userPhotos.length > limit;
    const resultPhotos = hasMore ? userPhotos.slice(0, limit) : userPhotos;

    const lastPhoto = resultPhotos[resultPhotos.length - 1];
    const sortDate = lastPhoto.takenAt || lastPhoto.createdAt;
    const sortDateStr = typeof sortDate === "string" ? sortDate : sortDate?.toISOString();
    const nextCursor = hasMore && lastPhoto && sortDateStr
      ? Buffer.from(
          JSON.stringify({
            sortDate: sortDateStr,
            id: lastPhoto.id,
          }),
        ).toString("base64")
      : null;

    const photosWithUrls = await Promise.all(
      resultPhotos.map(async (photo) => {
        if (photo.contentType?.startsWith("video/")) {
          // For videos, return signed URL of actual object (no thumbnails yet)
          const signedUrl = await getSignedUrl(
            s3,
            new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.s3Key }),
            { expiresIn: 3600 },
          );
          return {
            ...photo,
            thumbnailUrl: null,
            signedUrl,
          };
        } else {
          // For photos, return only thumbnail URL
          const thumbnailUrl = photo.thumbnailKey
            ? await getSignedUrl(
                s3,
                new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.thumbnailKey }),
                { expiresIn: 3600 },
              )
            : null;
          return {
            ...photo,
            thumbnailUrl,
          };
        }
      }),
    );

    return respond(200, { photos: photosWithUrls, nextCursor });
  }

  if (method === "DELETE") {
    const key = event.pathParameters?.key;
    if (!key) {
      return respond(400, { message: "Missing photo key" });
    }

    // Ownership guard: user segment ends with -{sub} (format: name-sub) or equals sub
    const parts = key.split("/");
    const userSegment = parts[1] ?? "";
    const keyUserId = userSegment.slice(-36); // Cognito sub is always last 36 chars
    if (keyUserId !== sub) {
      return respond(403, { message: "Forbidden" });
    }

    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    await db.delete(photos).where(eq(photos.s3Key, key));

    return respond(200, { message: "Photo deleted" });
  }

  if (method === "PATCH") {
    const key = event.pathParameters?.key;
    if (!key) return respond(400, { message: "Missing photo key" });

    const parts = key.split("/");
    const userSegment = parts[1] ?? "";
    const keyUserId = userSegment.slice(-36);
    if (keyUserId !== sub) return respond(403, { message: "Forbidden" });

    const body = JSON.parse(event.body ?? "{}");
    const takenAt = body.takenAt ? new Date(body.takenAt) : null;

    const [updated] = await db
      .update(photos)
      .set({ takenAt })
      .where(and(eq(photos.s3Key, key), eq(photos.userId, sub)))
      .returning();

    return respond(200, updated);
  }

  return respond(405, { message: "Method not allowed" });
};
