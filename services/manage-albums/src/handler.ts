import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { eq, and } from 'drizzle-orm';
import { createDb } from '../../shared/db';
import { albums, albumPhotos, photos } from '../../shared/schema';

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
    return respond(200, userAlbums);
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
      .where(eq(albumPhotos.albumId, albumId));

    return respond(200, { ...album, photos: albumPhotosList.map((r) => r.photo) });
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

  return respond(405, { message: 'Method not allowed' });
};
