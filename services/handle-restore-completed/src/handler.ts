import { EventBridgeEvent } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { createDb } from "../../shared/db";
import { photos, users } from "../../shared/schema";

const s3 = new S3Client({});
const ses = new SESClient({});
const cognito = new CognitoIdentityProviderClient({});
const BUCKET_NAME = process.env.BUCKET_NAME!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

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

  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ResponseContentDisposition: `attachment; filename="${photo.filename}"`,
    }),
    { expiresIn: 7 * 24 * 3600 }, // 7 days
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
              <p>This link expires in 7 days.</p>
              <p>— Psilo</p>
            `,
          },
          Text: {
            Data: `Hi ${givenName},\n\nYour photo "${photo.filename}" has been restored from Glacier and is ready to download:\n\n${downloadUrl}\n\nThis link expires in 7 days.\n\n— Psilo`,
          },
        },
      },
    }),
  );

  console.log(`Sent restore notification to ${email} for ${s3Key}`);
};
