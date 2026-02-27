import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { eq } from 'drizzle-orm';
import { createDb } from '../../shared/db';
import { photos } from '../../shared/schema';

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

  const db = createDb();

  if (method === 'GET') {
    const userPhotos = await db
      .select()
      .from(photos)
      .where(eq(photos.userId, sub));

    const photosWithUrls = await Promise.all(
      userPhotos.map(async (photo) => ({
        ...photo,
        signedUrl: await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.s3Key }),
          { expiresIn: 3600 },
        ),
      })),
    );

    return respond(200, photosWithUrls);
  }

  if (method === 'DELETE') {
    const key = event.pathParameters?.['key+'];
    if (!key) {
      return respond(400, { message: 'Missing photo key' });
    }

    // Ownership guard: user segment ends with -{sub} (format: name-sub) or equals sub
    const parts = key.split('/');
    const userSegment = parts[1] ?? '';
    const keyUserId = userSegment.slice(-36); // Cognito sub is always last 36 chars
    if (keyUserId !== sub) {
      return respond(403, { message: 'Forbidden' });
    }

    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    await db.delete(photos).where(eq(photos.s3Key, key));

    return respond(200, { message: 'Photo deleted' });
  }

  return respond(405, { message: 'Method not allowed' });
};
