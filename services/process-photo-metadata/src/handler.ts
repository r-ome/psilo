import { S3Event } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { createDb } from '../../shared/db';
import { photos } from '../../shared/schema';

const s3 = new S3Client({});

export const handler = async (event: S3Event): Promise<void> => {
  const db = createDb();

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const size = record.s3.object.size;

    // Skip folder marker objects
    if (key.endsWith('/')) continue;

    // Parse userId from key: users/{givenName}-{familyName}-{uuid}/{filename}
    // The Cognito sub is always a 36-char UUID at the end of the user segment.
    const parts = key.split('/');
    if (parts.length < 3 || parts[0] !== 'users') {
      console.log(`Skipping unexpected key format: ${key}`);
      continue;
    }
    const userSegment = parts[1];
    const userId = userSegment.slice(-36); // UUID is always the last 36 chars
    const filename = parts.slice(2).join('/');

    console.log(`Processing photo: ${key} for user: ${userId}`);

    try {
      const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      const metadata = await sharp(buffer).metadata();

      await db
        .insert(photos)
        .values({
          userId,
          s3Key: key,
          filename,
          size,
          width: metadata.width ?? null,
          height: metadata.height ?? null,
          format: metadata.format ?? null,
          contentType: response.ContentType ?? null,
        })
        .onConflictDoNothing();

      console.log(`Saved metadata for: ${key}`);
    } catch (err) {
      console.error(`Failed to process ${key}:`, err);
    }
  }
};
