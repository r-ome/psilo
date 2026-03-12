import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import { execSync } from "child_process";
import { createWriteStream, statSync } from "fs";
import { pipeline } from "stream/promises";
import path from "path";

const {
  BUCKET_NAME,
  VIDEO_KEY,
  DB_CLUSTER_ARN,
  DB_SECRET_ARN,
  DB_NAME,
  AWS_REGION,
} = process.env;

if (!BUCKET_NAME || !VIDEO_KEY || !DB_CLUSTER_ARN || !DB_SECRET_ARN || !DB_NAME || !AWS_REGION) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const s3 = new S3Client({ region: AWS_REGION });
const rds = new RDSDataClient({ region: AWS_REGION });

const key = VIDEO_KEY;
const ext = path.extname(key) || ".mp4";
const inputPath = `/tmp/input${ext}`;
const thumbPath = "/tmp/thumb.jpg";
const previewPath = "/tmp/preview.mp4";

// Parse key: users/{userFolder}/{subFolder}/{filename}
const parts = key.split("/");
const thumbnailKey = key
  .replace(/\/(photos|videos)\//, "/thumbnails/")
  .replace(/\.[^.]+$/, ".jpg");
const previewKey = key
  .replace(/\/(photos|videos)\//, "/previews/")
  .replace(/\.[^.]+$/, ".mp4");

async function downloadVideo() {
  console.log(`Downloading video: ${key}`);
  const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  const writer = createWriteStream(inputPath);
  await pipeline(response.Body, writer);
  console.log("Download complete");
}

function generateThumbnail() {
  console.log("Generating thumbnail...");
  execSync(
    `ffmpeg -i ${inputPath} -ss 00:00:01 -vframes 1 -q:v 2 ${thumbPath}`,
    { stdio: "inherit" }
  );
  console.log("Thumbnail generated");
}

function generatePreview() {
  console.log("Generating preview...");
  execSync(
    `ffmpeg -i ${inputPath} -t 5 -vf scale=640:-2 -c:v libx264 -crf 28 -an ${previewPath}`,
    { stdio: "inherit" }
  );
  console.log("Preview generated");
}

async function uploadFile(localPath, s3Key, contentType) {
  const { readFileSync } = await import("fs");
  const body = readFileSync(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: body,
    ContentType: contentType,
    StorageClass: "STANDARD",
  }));
  console.log(`Uploaded: ${s3Key}`);
  return body.length;
}

async function updateDb(thumbnailSize) {
  await rds.send(new ExecuteStatementCommand({
    resourceArn: DB_CLUSTER_ARN,
    secretArn: DB_SECRET_ARN,
    database: DB_NAME,
    sql: `UPDATE photos SET thumbnail_key = :thumbnailKey, preview_key = :previewKey,
          thumbnail_size = :thumbnailSize, status = 'completed' WHERE s3_key = :s3Key`,
    parameters: [
      { name: "thumbnailKey", value: { stringValue: thumbnailKey } },
      { name: "previewKey", value: { stringValue: previewKey } },
      { name: "thumbnailSize", value: { longValue: thumbnailSize } },
      { name: "s3Key", value: { stringValue: key } },
    ],
  }));
  console.log("DB updated");
}

async function run() {
  try {
    await downloadVideo();
    generateThumbnail();
    generatePreview();
    const thumbnailSize = await uploadFile(thumbPath, thumbnailKey, "image/jpeg");
    await uploadFile(previewPath, previewKey, "video/mp4");
    await updateDb(thumbnailSize);
    console.log("Job completed successfully");
  } catch (err) {
    console.error("Job failed:", err);
    process.exit(1);
  }
}

run();
