import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;

export const createUserPrefix = async (userId: string) => {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `users/${userId}/`,
      Body: "",
    }),
  );
};
