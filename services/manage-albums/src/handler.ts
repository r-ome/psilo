import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { eq, and, inArray, desc, isNotNull, isNull } from 'drizzle-orm';
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

    // Pick first (most recent) per album, generate presigned URL once per album
    const coverMap = new Map<string, string>();
    for (const row of coverRows) {
      if (!coverMap.has(row.albumId) && row.thumbnailKey) {
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: BUCKET_NAME, Key: row.thumbnailKey }),
          { expiresIn: 3600 },
        );
        coverMap.set(row.albumId, url);
      }
    }

    const result = userAlbums.map((album) => ({
      ...album,
      coverUrl: coverMap.get(album.id) ?? null,
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

    const albumPhotosList = await db
      .select({ photo: photos })
      .from(albumPhotos)
      .innerJoin(photos, eq(albumPhotos.photoId, photos.id))
      .where(and(eq(albumPhotos.albumId, albumId), isNull(photos.deletedAt)));

    const photosWithUrls = await Promise.all(
      albumPhotosList.map(async ({ photo }) => {
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

    return respond(200, { ...album, photos: photosWithUrls });
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
