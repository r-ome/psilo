import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq, desc, sql, and, or, lt, inArray, isNull, isNotNull } from "drizzle-orm";
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
          thumbnailSize: sql<number>`COALESCE(SUM(${photos.thumbnailSize}), 0)`,
          count: sql<number>`COUNT(*)`,
          photoCount: sql<number>`COALESCE(SUM(CASE WHEN ${photos.contentType} IS NULL OR ${photos.contentType} NOT LIKE 'video/%' THEN 1 ELSE 0 END), 0)`,
          videoCount: sql<number>`COALESCE(SUM(CASE WHEN ${photos.contentType} LIKE 'video/%' THEN 1 ELSE 0 END), 0)`,
        })
        .from(photos)
        .where(eq(photos.userId, sub))
        .groupBy(photos.storageClass);

      let standardSize = 0,
        glacierSize = 0,
        thumbnailSize = 0;
      let standardCount = 0,
        glacierCount = 0;
      let standardPhotoCount = 0,
        standardVideoCount = 0;
      let glacierPhotoCount = 0,
        glacierVideoCount = 0;

      for (const row of result) {
        thumbnailSize += Number(row.thumbnailSize);
        if (row.storageClass === "STANDARD") {
          standardSize = Number(row.totalSize);
          standardCount = Number(row.count);
          standardPhotoCount = Number(row.photoCount);
          standardVideoCount = Number(row.videoCount);
        } else if (row.storageClass === "GLACIER") {
          glacierSize = Number(row.totalSize);
          glacierCount = Number(row.count);
          glacierPhotoCount = Number(row.photoCount);
          glacierVideoCount = Number(row.videoCount);
        }
      }
      return respond(200, {
        standardSize,
        glacierSize,
        thumbnailSize,
        standardCount,
        glacierCount,
        standardPhotoCount,
        standardVideoCount,
        glacierPhotoCount,
        glacierVideoCount,
      });
    }

    if (event.rawPath?.endsWith("/trash")) {
      const cursor = event.queryStringParameters?.cursor;
      const limit =
        Math.min(parseInt(event.queryStringParameters?.limit ?? "10"), 100) || 30;

      let query = db.select().from(photos).where(and(eq(photos.userId, sub), isNotNull(photos.deletedAt)));

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
                isNotNull(photos.deletedAt),
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
      const sortDate = lastPhoto?.takenAt || lastPhoto?.createdAt;
      const sortDateStr =
        typeof sortDate === "string" ? sortDate : sortDate?.toISOString();
      const nextCursor =
        hasMore && lastPhoto && sortDateStr
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
                  new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: photo.thumbnailKey,
                  }),
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

    const cursor = event.queryStringParameters?.cursor;
    const limit =
      Math.min(parseInt(event.queryStringParameters?.limit ?? "10"), 100) || 30;

    let query = db.select().from(photos).where(and(eq(photos.userId, sub), isNull(photos.deletedAt)));

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
              isNull(photos.deletedAt),
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
    const sortDate = lastPhoto?.takenAt || lastPhoto?.createdAt;
    const sortDateStr =
      typeof sortDate === "string" ? sortDate : sortDate?.toISOString();
    const nextCursor =
      hasMore && lastPhoto && sortDateStr
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
                new GetObjectCommand({
                  Bucket: BUCKET_NAME,
                  Key: photo.thumbnailKey,
                }),
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
    // Bulk delete: body with keys array
    if (event.body) {
      let body: unknown;
      try {
        body = JSON.parse(event.body);
      } catch {
        return respond(400, { message: "Invalid JSON body" });
      }
      if (
        body &&
        typeof body === "object" &&
        "keys" in body &&
        Array.isArray((body as { keys: unknown }).keys)
      ) {
        const keys = (body as { keys: string[] }).keys;
        // Ownership guard: all keys must belong to sub
        for (const key of keys) {
          const parts = key.split("/");
          const userSegment = parts[1] ?? "";
          const keyUserId = userSegment.slice(-36);
          if (keyUserId !== sub) {
            return respond(403, { message: "Forbidden" });
          }
        }
        await db.update(photos).set({ deletedAt: new Date() })
          .where(and(inArray(photos.s3Key, keys), eq(photos.userId, sub)));
        return respond(200, { message: "Photos deleted" });
      }
    }

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

    await db.update(photos).set({ deletedAt: new Date() })
      .where(and(eq(photos.s3Key, key), eq(photos.userId, sub)));

    return respond(200, { message: "Photo deleted" });
  }

  if (method === "PATCH") {
    // Bulk update: body with keys array
    if (event.body) {
      let body: unknown;
      try {
        body = JSON.parse(event.body);
      } catch {
        return respond(400, { message: "Invalid JSON body" });
      }
      if (
        body &&
        typeof body === "object" &&
        "keys" in body &&
        Array.isArray((body as { keys: unknown }).keys)
      ) {
        const keys = (body as { keys: string[] }).keys;
        const takenAtStr = (body as { keys: string[]; takenAt?: string }).takenAt;
        const takenAt = takenAtStr ? new Date(takenAtStr) : null;

        // Ownership guard: all keys must belong to sub
        for (const key of keys) {
          const parts = key.split("/");
          const userSegment = parts[1] ?? "";
          const keyUserId = userSegment.slice(-36);
          if (keyUserId !== sub) {
            return respond(403, { message: "Forbidden" });
          }
        }

        await db.update(photos).set({ takenAt })
          .where(and(inArray(photos.s3Key, keys), eq(photos.userId, sub)));

        return respond(200, { message: "Photos updated" });
      }
    }

    // Single update: path parameter key
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

  if (method === "POST") {
    if (event.rawPath?.endsWith("/trash/restore")) {
      let body: unknown;
      try {
        body = JSON.parse(event.body ?? "{}");
      } catch {
        return respond(400, { message: "Invalid JSON body" });
      }
      if (
        body &&
        typeof body === "object" &&
        "keys" in body &&
        Array.isArray((body as { keys: unknown }).keys)
      ) {
        const keys = (body as { keys: string[] }).keys;

        // Ownership guard: all keys must belong to sub
        for (const key of keys) {
          const parts = key.split("/");
          const userSegment = parts[1] ?? "";
          const keyUserId = userSegment.slice(-36);
          if (keyUserId !== sub) {
            return respond(403, { message: "Forbidden" });
          }
        }

        await db.update(photos).set({ deletedAt: null })
          .where(and(inArray(photos.s3Key, keys), eq(photos.userId, sub)));

        return respond(200, { message: "Photos restored" });
      }
    }
    return respond(400, { message: "Invalid request" });
  }

  return respond(405, { message: "Method not allowed" });
};
