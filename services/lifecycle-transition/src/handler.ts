import { eq } from 'drizzle-orm';
import { createDb } from '../../shared/db';
import { photos } from '../../shared/schema';

interface S3StorageClassChangedDetail {
  bucket: { name: string };
  object: { key: string };
  "destination-storage-class": string;
}

interface EventBridgeEvent {
  source: string;
  "detail-type": string;
  detail: S3StorageClassChangedDetail;
}

export const handler = async (event: EventBridgeEvent): Promise<void> => {
  const key = decodeURIComponent(event.detail.object.key.replace(/\+/g, ' '));
  const destinationClass = event.detail["destination-storage-class"];

  if (destinationClass !== "STANDARD" && destinationClass !== "GLACIER") {
    console.warn(`Unrecognized storage class: ${destinationClass}, skipping.`);
    return;
  }

  const db = createDb();
  await db.update(photos).set({ storageClass: destinationClass }).where(eq(photos.s3Key, key));
  console.log(`Updated storage class for ${key} → ${destinationClass}`);
};
