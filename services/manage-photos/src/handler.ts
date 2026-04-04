import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getPrivateKey, cfSignedUrl } from "../../shared/cloudfront";
import { eq, desc, sql, and, or, lt, inArray, isNull, isNotNull } from "drizzle-orm";
import { createDb } from "../../shared/db";
import { photos, users, retrievalBatches } from "../../shared/schema";
import {
  MANAGEABLE_TIERS,
  TIERS,
  type ManageableTierName,
} from "../../shared/tiers";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;

function respond(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function getStorageLimitBytes(plan: ManageableTierName): number {
  const limitBytes = TIERS[plan].limitBytes;
  if (limitBytes == null) {
    throw new Error(`Plan ${plan} does not have a storage limit`);
  }
  return limitBytes;
}

async function handleGetRequest(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  db: ReturnType<typeof createDb>,
  sub: string,
): Promise<APIGatewayProxyResultV2> {
  if (event.rawPath?.endsWith("/user/profile")) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, sub));

    if (!user) {
      return respond(404, { message: "User not found" });
    }

    return respond(200, {
      id: user.id,
      email: user.email,
      givenName: user.givenName,
      familyName: user.familyName,
      plan: user.plan,
      storageLimitBytes: Number(user.storageLimitBytes),
      createdAt: user.createdAt,
    });
  }

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
    const retrievalResult = await db
      .select({
        retrievalTier: retrievalBatches.retrievalTier,
        totalSize: sql<number>`COALESCE(SUM(${retrievalBatches.totalSize}), 0)`,
      })
      .from(retrievalBatches)
      .where(eq(retrievalBatches.userId, sub))
      .groupBy(retrievalBatches.retrievalTier);

    const retrievalSizeByTier: Record<string, number> = {};
    for (const row of retrievalResult) {
      retrievalSizeByTier[row.retrievalTier] = Number(row.totalSize);
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
      retrievalSizeByTier,
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

    const USE_CF = process.env.USE_CLOUDFRONT === "true";
    const privateKey = USE_CF ? await getPrivateKey() : null;
    const signUrl = async (key: string) =>
      USE_CF
        ? cfSignedUrl(key, privateKey!)
        : getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), { expiresIn: 3600 });

    const photosWithUrls = await Promise.all(
      resultPhotos.map(async (photo) => {
        if (photo.contentType?.startsWith("video/")) {
          const [signedUrl, thumbnailUrl, previewUrl] = await Promise.all([
            signUrl(photo.s3Key),
            photo.thumbnailKey ? signUrl(photo.thumbnailKey) : null,
            photo.previewKey ? signUrl(photo.previewKey) : null,
          ]);
          return { ...photo, signedUrl, thumbnailUrl, previewUrl };
        } else {
          const [thumbnailUrl, previewUrl] = await Promise.all([
            photo.thumbnailKey ? signUrl(photo.thumbnailKey) : null,
            photo.previewKey ? signUrl(photo.previewKey) : null,
          ]);
          return { ...photo, thumbnailUrl, previewUrl };
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

  const USE_CF = process.env.USE_CLOUDFRONT === "true";
  const privateKey = USE_CF ? await getPrivateKey() : null;
  const signUrl = async (key: string) =>
    USE_CF
      ? cfSignedUrl(key, privateKey!)
      : getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), { expiresIn: 3600 });

  const photosWithUrls = await Promise.all(
    resultPhotos.map(async (photo) => {
      if (photo.contentType?.startsWith("video/")) {
        const [signedUrl, thumbnailUrl, previewUrl] = await Promise.all([
          signUrl(photo.s3Key),
          photo.thumbnailKey ? signUrl(photo.thumbnailKey) : null,
          photo.previewKey ? signUrl(photo.previewKey) : null,
        ]);
        return { ...photo, signedUrl, thumbnailUrl, previewUrl };
      } else {
        const [thumbnailUrl, previewUrl] = await Promise.all([
          photo.thumbnailKey ? signUrl(photo.thumbnailKey) : null,
          photo.previewKey ? signUrl(photo.previewKey) : null,
        ]);
        return { ...photo, thumbnailUrl, previewUrl };
      }
    }),
  );

  return respond(200, { photos: photosWithUrls, nextCursor });
}

async function handlePatchRequest(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  db: ReturnType<typeof createDb>,
  sub: string,
): Promise<APIGatewayProxyResultV2> {
  if (event.rawPath?.endsWith("/user/profile")) {
    let body: unknown;
    try {
      body = JSON.parse(event.body ?? "{}");
    } catch {
      return respond(400, { message: "Invalid JSON body" });
    }

    const plan = (body as { plan?: string }).plan;
    if (!plan || !MANAGEABLE_TIERS.includes(plan as ManageableTierName)) {
      return respond(422, { message: "Invalid plan" });
    }

    const [updatedUser] = await db
      .update(users)
      .set({
        plan,
        storageLimitBytes: getStorageLimitBytes(plan as ManageableTierName),
      })
      .where(eq(users.id, sub))
      .returning();

    if (!updatedUser) {
      return respond(404, { message: "User not found" });
    }

    return respond(200, {
      id: updatedUser.id,
      email: updatedUser.email,
      givenName: updatedUser.givenName,
      familyName: updatedUser.familyName,
      plan: updatedUser.plan,
      storageLimitBytes: Number(updatedUser.storageLimitBytes),
      createdAt: updatedUser.createdAt,
    });
  }

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

async function handleDeleteRequest(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  db: ReturnType<typeof createDb>,
  sub: string,
): Promise<APIGatewayProxyResultV2> {
  // Permanent delete from trash
  if (event.rawPath?.endsWith("/trash")) {
    let body: unknown;
    try {
      body = JSON.parse(event.body ?? "{}");
    } catch {
      return respond(400, { message: "Invalid JSON body" });
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("keys" in body) ||
      !Array.isArray((body as { keys: unknown }).keys)
    ) {
      return respond(400, { message: "Missing keys array" });
    }
    const keys = (body as { keys: string[] }).keys;

    // Ownership guard
    for (const key of keys) {
      const parts = key.split("/");
      const userSegment = parts[1] ?? "";
      const keyUserId = userSegment.slice(-36);
      if (keyUserId !== sub) {
        return respond(403, { message: "Forbidden" });
      }
    }

    // Fetch matching trashed photos to get thumbnail and preview keys
    const toDelete = await db
      .select({ id: photos.id, s3Key: photos.s3Key, thumbnailKey: photos.thumbnailKey, previewKey: photos.previewKey })
      .from(photos)
      .where(and(inArray(photos.s3Key, keys), eq(photos.userId, sub), isNotNull(photos.deletedAt)));

    if (toDelete.length === 0) {
      return respond(200, { message: "No photos to delete", count: 0 });
    }

    // Collect all S3 keys (originals + thumbnails + previews)
    const s3Keys: string[] = [];
    for (const p of toDelete) {
      s3Keys.push(p.s3Key);
      if (p.thumbnailKey) s3Keys.push(p.thumbnailKey);
      if (p.previewKey) s3Keys.push(p.previewKey);
    }

    // Batch delete from S3 (max 1000 per call)
    for (let i = 0; i < s3Keys.length; i += 1000) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: { Objects: s3Keys.slice(i, i + 1000).map((Key) => ({ Key })) },
        }),
      );
    }

    // Hard-delete from DB
    const ids = toDelete.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 500) {
      await db.delete(photos).where(inArray(photos.id, ids.slice(i, i + 500)));
    }

    return respond(200, { message: "Photos permanently deleted", count: toDelete.length });
  }

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

async function handlePostRequest(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  db: ReturnType<typeof createDb>,
  sub: string,
): Promise<APIGatewayProxyResultV2> {
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

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const sub = event.requestContext.authorizer.jwt.claims["sub"] as string;
  const method = event.requestContext.http.method;
  const db = createDb();

  switch (method) {
    case "GET":
      return handleGetRequest(event, db, sub);
    case "PATCH":
      return handlePatchRequest(event, db, sub);
    case "DELETE":
      return handleDeleteRequest(event, db, sub);
    case "POST":
      return handlePostRequest(event, db, sub);
    default:
      return respond(405, { message: "Method not allowed" });
  }
};
