import { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { eq } from 'drizzle-orm';
import { createDb } from '../../shared/db';
import { photos } from '../../shared/schema';

function bodyPreview(body: string, maxLength = 200): string {
  if (body.length <= maxLength) {
    return body;
  }

  return `${body.slice(0, maxLength)}...`;
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const db = createDb();
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const sqsRecord of event.Records) {
    try {
      let s3Event: { Records?: Array<{ s3?: { object?: { key?: string } } }> };
      try {
        s3Event = JSON.parse(sqsRecord.body);
      } catch (err) {
        console.error('Dropping unparsable DLQ message', {
          messageId: sqsRecord.messageId,
          bodyPreview: bodyPreview(sqsRecord.body),
          err,
        });
        continue;
      }

      const record = s3Event.Records?.[0];
      if (!record) {
        console.warn('Missing S3 record:', sqsRecord.messageId);
        continue;
      }

      const key = decodeURIComponent(record.s3?.object?.key?.replace(/\+/g, ' ') ?? '');
      if (!key) {
        console.warn('Missing S3 object key:', sqsRecord.messageId);
        continue;
      }

      await db.update(photos).set({ status: 'failed' }).where(eq(photos.s3Key, key));

      console.log(`Marked photo as failed: ${key}`);
    } catch (err) {
      console.error(`DLQ handler failed for ${sqsRecord.messageId}:`, err);
      batchItemFailures.push({ itemIdentifier: sqsRecord.messageId });
    }
  }

  return { batchItemFailures };
};
