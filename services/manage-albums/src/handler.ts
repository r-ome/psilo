import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getPrivateKey, cfSignedUrl } from '../../shared/cloudfront';
import { eq, and, inArray, desc, isNotNull, isNull, or, lt, sql } from 'drizzle-orm';
import { createDb } from '../../shared/db';
import { albums, albumPhotos, photos } from '../../shared/schema';

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;

function respond(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const sub = event.requestContext.authorizer.jwt.claims['sub'] as string;
  const method = event.requestContext.http.method;
  const routeKey = event.routeKey;

  const db = createDb();

  // POST /albums
  if (method === 'POST' && routeKey === 'POST /albums') {
    const body = event.body ? JSON.parse(event.body) : {};
    const { name } = body as { name: string };
    if (!name) return respond(400, { message: 'name is required' });

    const [album] = await db.insert(albums).values({ userId: sub, name }).returning();
    return respond(201, album);
  }

  // GET /albums
  if (method === 'GET' && routeKey === 'GET /albums') {
    const userAlbums = await db.select().from(albums).where(eq(albums.userId, sub));

    if (userAlbums.length === 0) {
      return respond(200, []);
    }

    const albumIds = userAlbums.map((a) => a.id);

    // Single query: get most-recently-added completed photo with thumbnail per album
    const coverRows = await db
      .select({
        albumId: albumPhotos.albumId,
        thumbnailKey: photos.thumbnailKey,
      })
      .from(albumPhotos)
      .innerJoin(photos, eq(albumPhotos.photoId, photos.id))
      .where(
        and(
          inArray(albumPhotos.albumId, albumIds),
          isNotNull(photos.thumbnailKey),
          eq(photos.status, 'completed'),
          isNull(photos.deletedAt),
        ),
      )
      .orderBy(desc(albumPhotos.addedAt));

    // Pick first (most recent) per album, generate signed URL once per album
    const USE_CF = process.env.USE_CLOUDFRONT === "true";
    const privateKey = USE_CF ? await getPrivateKey() : null;
    const signUrl = async (key: string) =>
      USE_CF
        ? cfSignedUrl(key, privateKey!)
        : getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), { expiresIn: 3600 });

    const MAX_COVERS = 4;
    const coverMap = new Map<string, string[]>();
    for (const row of coverRows) {
      if (!row.thumbnailKey) continue;
      const urls = coverMap.get(row.albumId) ?? [];
      if (urls.length >= MAX_COVERS) continue;
      urls.push(await signUrl(row.thumbnailKey));
      coverMap.set(row.albumId, urls);
    }

    const result = userAlbums.map((album) => ({
      ...album,
      coverUrls: coverMap.get(album.id) ?? [],
    }));

    return respond(200, result);
  }

  // GET /albums/{albumId}
  if (method === 'GET' && routeKey === 'GET /albums/{albumId}') {
    const albumId = event.pathParameters?.albumId;
    if (!albumId) return respond(400, { message: 'Missing albumId' });

    const [album] = await db.select().from(albums).where(
      and(eq(albums.id, albumId), eq(albums.userId, sub)),
    );
    if (!album) return respond(404, { message: 'Album not found' });

    const cursor = event.queryStringParameters?.cursor;
    const limit = Math.min(parseInt(event.queryStringParameters?.limit ?? '30'), 100) || 30;

    let photosQuery = db
      .select({ photo: photos })
      .from(albumPhotos)
      .innerJoin(photos, eq(albumPhotos.photoId, photos.id))
      .where(and(eq(albumPhotos.albumId, albumId), isNull(photos.deletedAt)));

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
        const { sortDate, id: cursorId } = decoded;
        photosQuery = db
          .select({ photo: photos })
          .from(albumPhotos)
          .innerJoin(photos, eq(albumPhotos.photoId, photos.id))
          .where(
            and(
              eq(albumPhotos.albumId, albumId),
              isNull(photos.deletedAt),
              or(
                lt(sql`COALESCE(${photos.takenAt}, ${photos.createdAt})`, sql`${sortDate}::timestamp`),
                and(
                  eq(sql`COALESCE(${photos.takenAt}, ${photos.createdAt})`, sql`${sortDate}::timestamp`),
                  lt(photos.id, cursorId),
                ),
              ),
            ),
          );
      } catch {
        return respond(400, { message: 'Invalid cursor' });
      }
    }

    const rawPhotos = await photosQuery
      .orderBy(desc(sql`COALESCE(${photos.takenAt}, ${photos.createdAt})`), desc(photos.id))
      .limit(limit + 1);

    const hasMore = rawPhotos.length > limit;
    const resultPhotos = hasMore ? rawPhotos.slice(0, limit) : rawPhotos;

    const lastPhoto = resultPhotos[resultPhotos.length - 1]?.photo;
    const sortDate = lastPhoto?.takenAt || lastPhoto?.createdAt;
    const sortDateStr = typeof sortDate === 'string' ? sortDate : sortDate?.toISOString();
    const nextCursor =
      hasMore && lastPhoto && sortDateStr
        ? Buffer.from(JSON.stringify({ sortDate: sortDateStr, id: lastPhoto.id })).toString('base64')
        : null;

    const USE_CF_ALBUM = process.env.USE_CLOUDFRONT === "true";
    const privateKeyAlbum = USE_CF_ALBUM ? await getPrivateKey() : null;
    const signUrlAlbum = async (key: string) =>
      USE_CF_ALBUM
        ? cfSignedUrl(key, privateKeyAlbum!)
        : getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), { expiresIn: 3600 });

    const photosWithUrls = await Promise.all(
      resultPhotos.map(async ({ photo }) => {
        if (photo.contentType?.startsWith("video/")) {
          const [signedUrl, thumbnailUrl, previewUrl] = await Promise.all([
            signUrlAlbum(photo.s3Key),
            photo.thumbnailKey ? signUrlAlbum(photo.thumbnailKey) : null,
            photo.previewKey ? signUrlAlbum(photo.previewKey) : null,
          ]);
          return { ...photo, signedUrl, thumbnailUrl, previewUrl };
        } else {
          const thumbnailUrl = photo.thumbnailKey ? await signUrlAlbum(photo.thumbnailKey) : null;
          return { ...photo, thumbnailUrl };
        }
      }),
    );

    return respond(200, { ...album, photos: photosWithUrls, nextCursor });
  }

  // POST /albums/{albumId}/photos
  if (method === 'POST' && routeKey === 'POST /albums/{albumId}/photos') {
    const albumId = event.pathParameters?.albumId;
    if (!albumId) return respond(400, { message: 'Missing albumId' });

    // Verify album ownership
    const [album] = await db.select().from(albums).where(
      and(eq(albums.id, albumId), eq(albums.userId, sub)),
    );
    if (!album) return respond(404, { message: 'Album not found' });

    const body = event.body ? JSON.parse(event.body) : {};
    const { photoId } = body as { photoId: string };
    if (!photoId) return respond(400, { message: 'photoId is required' });

    await db.insert(albumPhotos).values({ albumId, photoId }).onConflictDoNothing();
    return respond(201, { message: 'Photo added to album' });
  }

  // DELETE /albums/{albumId}/photos/{photoId}
  if (method === 'DELETE' && routeKey === 'DELETE /albums/{albumId}/photos/{photoId}') {
    const albumId = event.pathParameters?.albumId;
    const photoId = event.pathParameters?.photoId;
    if (!albumId || !photoId) return respond(400, { message: 'Missing albumId or photoId' });

    // Verify album ownership
    const [album] = await db.select().from(albums).where(
      and(eq(albums.id, albumId), eq(albums.userId, sub)),
    );
    if (!album) return respond(404, { message: 'Album not found' });

    await db.delete(albumPhotos).where(
      and(eq(albumPhotos.albumId, albumId), eq(albumPhotos.photoId, photoId)),
    );
    return respond(200, { message: 'Photo removed from album' });
  }

  // DELETE /albums/{albumId}
  if (method === 'DELETE' && routeKey === 'DELETE /albums/{albumId}') {
    const albumId = event.pathParameters?.albumId;
    if (!albumId) return respond(400, { message: 'Missing albumId' });

    // Verify album ownership
    const [album] = await db.select().from(albums).where(
      and(eq(albums.id, albumId), eq(albums.userId, sub)),
    );
    if (!album) return respond(404, { message: 'Album not found' });

    // Delete all album-photo associations
    await db.delete(albumPhotos).where(eq(albumPhotos.albumId, albumId));

    // Delete the album
    await db.delete(albums).where(eq(albums.id, albumId));

    return respond(200, { message: 'Album deleted' });
  }

  // PUT /albums/{albumId}
  if (method === 'PUT' && routeKey === 'PUT /albums/{albumId}') {
    const albumId = event.pathParameters?.albumId;
    if (!albumId) return respond(400, { message: 'Missing albumId' });

    const body = event.body ? JSON.parse(event.body) : {};
    const { name } = body as { name: string };
    if (!name || !name.trim()) return respond(400, { message: 'name is required' });

    // Verify album ownership
    const [existingAlbum] = await db.select().from(albums).where(
      and(eq(albums.id, albumId), eq(albums.userId, sub)),
    );
    if (!existingAlbum) return respond(404, { message: 'Album not found' });

    // Update the album
    await db.update(albums).set({ name: name.trim() }).where(eq(albums.id, albumId));

    // Fetch and return the updated album
    const [updatedAlbum] = await db.select().from(albums).where(eq(albums.id, albumId));
    return respond(200, updatedAlbum);
  }

  return respond(405, { message: 'Method not allowed' });
};
