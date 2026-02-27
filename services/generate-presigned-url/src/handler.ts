import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const claims = event.requestContext.authorizer.jwt.claims;
  const userId = claims.sub as string;
  const givenName = (claims.given_name as string) ?? '';
  const familyName = (claims.family_name as string) ?? '';
  const body = JSON.parse(event.body ?? "{}");
  const { filename, contentType } = body;

  if (!filename || !contentType) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "filename and contentType are required",
      }),
    };
  }

  const userPrefix = givenName && familyName
    ? `${givenName}-${familyName}-${userId}`
    : userId;
  const key = `users/${userPrefix}/${filename}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, key }),
  };
};
