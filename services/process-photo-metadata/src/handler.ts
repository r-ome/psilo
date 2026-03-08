import { SQSEvent, SQSBatchResponse } from "aws-lambda";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import exifReader from "exif-reader";
import { createDb } from "../../shared/db";
import { photos } from "../../shared/schema";

const s3 = new S3Client({});

function extractTakenAtFromFilename(filename: string): Date | null {
  // macOS screenshot: "Screenshot 2026-03-05 at 17-33-19 .png"
  const macScreenshot = filename.match(
    /(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\s+at\s+(\d{2})-(\d{2})-(\d{2})/,
  );
  if (macScreenshot) {
    const [, yr, mo, dy, hr, mn, sc] = macScreenshot;
    const d = new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:${sc}`);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) return d;
  }
  // iOS/macOS share: "2026-03-02 17.08.14.jpg" (YYYY-MM-DD HH.MM.SS)
  const isoWithTime = filename.match(
    /(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[\s_\-](\d{2})[.:\-](\d{2})[.:\-](\d{2})/,
  );
  if (isoWithTime) {
    const [, yr, mo, dy, hr, mn, sc] = isoWithTime;
    const d = new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:${sc}`);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) return d;
  }
  // Android/Screenshot: IMG_20231215_103045.jpg, Screenshot_20231215-103045.jpg
  const withTime = filename.match(
    /(\d{4})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[_\-](\d{2})(\d{2})(\d{2})/,
  );
  if (withTime) {
    const [, yr, mo, dy, hr, mn, sc] = withTime;
    const d = new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:${sc}`);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) return d;
  }
  // WhatsApp / date-only: IMG-20231215-WA0001.jpg
  const dateOnly = filename.match(
    /(\d{4})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/,
  );
  if (dateOnly) {
    const [, yr, mo, dy] = dateOnly;
    const d = new Date(`${yr}-${mo}-${dy}`);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) return d;
  }
  return null;
}

function extractTakenAt(
  exifBuffer: Buffer | undefined,
  filename: string,
): Date | null {
  if (exifBuffer) {
    try {
      const data = exifReader(exifBuffer);
      const date = data.exif?.DateTimeOriginal ?? data.image?.DateTime ?? null;
      if (date instanceof Date && !isNaN(date.getTime())) return date;
    } catch {
      // fall through to filename
    }
  }
  return extractTakenAtFromFilename(filename);
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const db = createDb();
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const sqsRecord of event.Records) {
    try {
      const s3Event = JSON.parse(sqsRecord.body);
      const record = s3Event.Records[0];
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
      const size = record.s3.object.size;

      // Skip folder marker objects
      if (key.endsWith("/")) continue;

      // Parse userId from key: users/{givenName}-{familyName}-{uuid}/{filename}
      const parts = key.split("/");
      if (parts.length < 3 || parts[0] !== "users") {
        console.log(`Skipping unexpected key format: ${key}`);
        continue;
      }
      const userId = parts[1].slice(-36); // UUID is always the last 36 chars
      const filename = parts.slice(2).join("/");

      console.log(`Processing: ${key} for user: ${userId}`);

      // Phase 1: mark as processing (idempotent — handles SQS re-delivery)
      await db
        .insert(photos)
        .values({ userId, s3Key: key, filename, size, status: "processing" })
        .onConflictDoUpdate({
          target: photos.s3Key,
          set: { status: "processing" },
        });

      // Phase 2: check content type first to avoid downloading large video files
      const head = await s3.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      const contentType = head.ContentType ?? null;

      let width: number | null = null;
      let height: number | null = null;
      let format: string | null = null;
      let takenAt: Date | null = null;

      if (!contentType?.startsWith("video/")) {
        const response = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        const metadata = await sharp(Buffer.concat(chunks)).metadata();
        width = metadata.width ?? null;
        height = metadata.height ?? null;
        format = metadata.format ?? null;
        takenAt = extractTakenAt(metadata.exif as Buffer | undefined, filename);
      }

      await db
        .update(photos)
        .set({
          status: "completed",
          width,
          height,
          format,
          contentType,
          takenAt,
        })
        .where(eq(photos.s3Key, key));

      console.log(`Saved metadata for: ${key}`);
    } catch (err) {
      console.error(`Failed to process ${sqsRecord.messageId}:`, err);
      batchItemFailures.push({ itemIdentifier: sqsRecord.messageId });
    }
  }

  return { batchItemFailures };
};
