import { EventBridgeEvent } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq, and, inArray, not } from "drizzle-orm";
import { createDb } from "../../shared/db";
import { photos, users, retrievalBatches, retrievalRequests } from "../../shared/schema";

const s3 = new S3Client({});
const ses = new SESClient({});
const cognito = new CognitoIdentityProviderClient({});
const BUCKET_NAME = process.env.BUCKET_NAME!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
const RESTORE_RETENTION_DAYS = parseInt(process.env.RESTORE_RETENTION_DAYS ?? "7", 10);

interface S3RestoreCompletedDetail {
  bucket: { name: string };
  object: { key: string };
}

export const handler = async (
  event: EventBridgeEvent<"Object Restore Completed", S3RestoreCompletedDetail>,
): Promise<void> => {
  const rawKey = event.detail.object.key;
  const s3Key = decodeURIComponent(rawKey.replace(/\+/g, " "));

  const db = createDb();

  const [photo] = await db
    .select()
    .from(photos)
    .where(eq(photos.s3Key, s3Key))
    .limit(1);

  if (!photo) {
    console.warn(`No photo found for key: ${s3Key}`);
    return;
  }

  let email: string;
  let givenName: string;

  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, photo.userId))
    .limit(1);

  if (dbUser) {
    email = dbUser.email;
    givenName = dbUser.givenName;
  } else {
    // Fall back to Cognito if the user row is missing from the DB
    console.warn(`User not in DB for userId: ${photo.userId}, falling back to Cognito`);
    const cognitoUser = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: photo.userId }),
    );
    const attrs = Object.fromEntries(
      (cognitoUser.UserAttributes ?? []).map((a) => [a.Name, a.Value]),
    );
    email = attrs["email"] ?? "";
    givenName = attrs["given_name"] ?? "there";
    if (!email) {
      console.error(`Could not resolve email for userId: ${photo.userId}`);
      return;
    }
  }

  const retentionSeconds = RESTORE_RETENTION_DAYS * 24 * 3600;
  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ResponseContentDisposition: `attachment; filename="${photo.filename}"`,
    }),
    { expiresIn: retentionSeconds },
  );

  await ses.send(
    new SendEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "Your photo is ready to download" },
        Body: {
          Html: {
            Data: `
              <p>Hi ${givenName},</p>
              <p>Your photo <strong>${photo.filename}</strong> has been restored from Glacier and is ready to download.</p>
              <p><a href="${downloadUrl}">Download your photo</a></p>
              <p>This link expires in ${RESTORE_RETENTION_DAYS} days.</p>
              <p>— Psilo</p>
            `,
          },
          Text: {
            Data: `Hi ${givenName},\n\nYour photo "${photo.filename}" has been restored from Glacier and is ready to download:\n\n${downloadUrl}\n\nThis link expires in ${RESTORE_RETENTION_DAYS} days.\n\n— Psilo`,
          },
        },
      },
    }),
  );

  console.log(`Sent restore notification to ${email} for ${s3Key}`);

  // Update retrieval tracking records
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESTORE_RETENTION_DAYS * 24 * 3600 * 1000);

  // Only update SINGLE-batch requests (email flow owns SINGLE; zip flow owns ALBUM/MANUAL)
  const singleBatchIds = (
    await db
      .select({ id: retrievalBatches.id })
      .from(retrievalBatches)
      .innerJoin(retrievalRequests, eq(retrievalRequests.batchId, retrievalBatches.id))
      .where(
        and(
          eq(retrievalRequests.s3Key, s3Key),
          eq(retrievalBatches.batchType, "SINGLE"),
          not(inArray(retrievalBatches.status, ["EXPIRED", "FAILED"])),
        ),
      )
  ).map((r) => r.id);

  if (singleBatchIds.length === 0) {
    console.log(`No SINGLE batch found for key: ${s3Key}, skipping email flow`);
    return;
  }

  const updatedRequests = await db
    .update(retrievalRequests)
    .set({ status: "AVAILABLE", availableAt: now, expiresAt, retrievalLink: downloadUrl })
    .where(
      and(
        eq(retrievalRequests.s3Key, s3Key),
        eq(retrievalRequests.status, "IN_PROGRESS"),
        inArray(retrievalRequests.batchId, singleBatchIds),
      ),
    )
    .returning();

  // Recalculate status for each affected batch
  const affectedBatchIds = [...new Set(updatedRequests.map((r) => r.batchId))];
  for (const batchId of affectedBatchIds) {
    const allRequests = await db
      .select()
      .from(retrievalRequests)
      .where(eq(retrievalRequests.batchId, batchId));

    const allAvailable = allRequests.every((r) => r.status === "AVAILABLE");
    const someAvailable = allRequests.some((r) => r.status === "AVAILABLE");
    const newBatchStatus = allAvailable ? "AVAILABLE" : someAvailable ? "PARTIAL" : "PENDING";

    // These are already scoped to SINGLE batches, so update from any active status.
    // (IN_PROGRESS is the normal state after initiateBatchRetrieval runs.)
    await db
      .update(retrievalBatches)
      .set({
        status: newBatchStatus,
        ...(allAvailable ? { availableAt: now, expiresAt } : {}),
      })
      .where(
        and(
          eq(retrievalBatches.id, batchId),
          inArray(retrievalBatches.status, ["PENDING", "IN_PROGRESS", "PARTIAL", "AVAILABLE"]),
        ),
      );
  }
};
