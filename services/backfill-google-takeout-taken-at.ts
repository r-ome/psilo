/**
 * Backfill Google Takeout takenAt using sidecar priority:
 *   1. photoTakenTime
 *   2. creationTime
 *   3. keep existing fallback takenAt
 *
 * Usage:
 *   DB_CLUSTER_ARN=... DB_SECRET_ARN=... DB_NAME=psilo AWS_REGION=ap-southeast-1 BUCKET_NAME=... \
 *   npx tsx backfill-google-takeout-taken-at.ts --import-id <google-takeout-import-id>
 *
 * Options:
 *   --import-id <id>    Required. Restrict updates to one import id.
 *   --apply             Actually write updates. Default is dry-run.
 */
import path from "node:path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, isNull, like, or } from "drizzle-orm";
import { createDb } from "./shared/db";
import { photos } from "./shared/schema";

type GoogleTakeoutSidecar = {
  photoTakenTime?: {
    timestamp?: string;
    formatted?: string;
  };
  creationTime?: {
    timestamp?: string;
    formatted?: string;
  };
};

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.BUCKET_NAME!;
const IMPORT_ID = getArgValue("--import-id");
const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 100;

if (!IMPORT_ID) {
  console.error("Missing required --import-id <google-takeout-import-id>");
  process.exit(1);
}

function getArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function parseGoogleTakeoutTimestamp(
  timestamp: string | undefined,
  formatted: string | undefined,
): Date | null {
  if (timestamp) {
    const unixTimestamp = Number(timestamp);
    if (Number.isFinite(unixTimestamp) && unixTimestamp > 0) {
      const date = new Date(unixTimestamp * 1000);
      if (!isNaN(date.getTime())) return date;
    }
  }

  if (formatted) {
    const date = new Date(formatted);
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}

function extractTakenAtFromGoogleTakeoutMetadata(
  metadata: GoogleTakeoutSidecar,
): Date | null {
  return (
    parseGoogleTakeoutTimestamp(
      metadata.photoTakenTime?.timestamp,
      metadata.photoTakenTime?.formatted,
    ) ??
    parseGoogleTakeoutTimestamp(
      metadata.creationTime?.timestamp,
      metadata.creationTime?.formatted,
    )
  );
}

function getCanonicalSiblingFilename(filename: string): string {
  const extension = path.posix.extname(filename);
  const base = extension ? filename.slice(0, -extension.length) : filename;
  const editedMatch = base.match(/^(.*)-edited(?:\(\d+\))?$/i);
  if (editedMatch?.[1]) {
    return `${editedMatch[1]}${extension}`;
  }
  return filename;
}

async function streamToBuffer(
  body: AsyncIterable<Uint8Array>,
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of body) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    candidate.name === "NoSuchKey" ||
    candidate.Code === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

async function readGoogleTakeoutTakenAt(mediaKey: string): Promise<Date | null> {
  const candidateKeys = new Set<string>([`${mediaKey}.json`]);
  const canonicalSiblingKey = (() => {
    const dirname = path.posix.dirname(mediaKey);
    const basename = path.posix.basename(mediaKey);
    const canonicalFilename = getCanonicalSiblingFilename(basename);

    if (canonicalFilename === basename) return null;

    return `${dirname}/${canonicalFilename}.json`;
  })();

  if (canonicalSiblingKey) {
    candidateKeys.add(canonicalSiblingKey);
  }

  for (const candidateKey of candidateKeys) {
    try {
      const response = await s3.send(
        new GetObjectCommand({ Bucket: BUCKET_NAME, Key: candidateKey }),
      );
      const body = response.Body as AsyncIterable<Uint8Array> | undefined;
      if (!body) continue;

      const buffer = await streamToBuffer(body);
      const parsed = JSON.parse(buffer.toString("utf-8")) as GoogleTakeoutSidecar;
      const takenAt = extractTakenAtFromGoogleTakeoutMetadata(parsed);
      if (takenAt) return takenAt;
    } catch (error) {
      if (isMissingObjectError(error)) continue;
      console.warn(`Failed to read sidecar for ${candidateKey}:`, error);
      return null;
    }
  }

  return null;
}

function shouldReplaceTakenAt(
  currentTakenAt: Date | null,
  createdAt: Date | null,
  candidateTakenAt: Date,
): boolean {
  if (!currentTakenAt) {
    return true;
  }

  if (!createdAt) {
    return false;
  }

  const diffMs = Math.abs(currentTakenAt.getTime() - createdAt.getTime());
  const looksLikeImportTimeFallback = diffMs <= 5 * 60 * 1000;

  return looksLikeImportTimeFallback && candidateTakenAt.getTime() !== currentTakenAt.getTime();
}

async function main() {
  const db = createDb();
  let offset = 0;
  let scanned = 0;
  let candidates = 0;
  let updated = 0;

  console.log(
    `${APPLY ? "Applying" : "Dry run"} Google Takeout takenAt backfill for import ${IMPORT_ID}...`,
  );

  while (true) {
    const rows = await db
      .select({
        id: photos.id,
        s3Key: photos.s3Key,
        filename: photos.filename,
        takenAt: photos.takenAt,
        createdAt: photos.createdAt,
      })
      .from(photos)
      .where(
        and(
          isNull(photos.deletedAt),
          like(photos.s3Key, `%/google-takeout/${IMPORT_ID}/%`),
          or(
            like(photos.contentType, "image/%"),
            like(photos.contentType, "video/%"),
          ),
        ),
      )
      .limit(BATCH_SIZE)
      .offset(offset);

    if (rows.length === 0) break;

    for (const row of rows) {
      scanned++;
      const candidateTakenAt = await readGoogleTakeoutTakenAt(row.s3Key);
      if (!candidateTakenAt) {
        continue;
      }

      if (!shouldReplaceTakenAt(row.takenAt, row.createdAt, candidateTakenAt)) {
        continue;
      }

      candidates++;
      console.log(
        `[candidate] ${row.filename}: ${row.takenAt?.toISOString() ?? "null"} -> ${candidateTakenAt.toISOString()}`,
      );

      if (!APPLY) {
        continue;
      }

      await db
        .update(photos)
        .set({ takenAt: candidateTakenAt })
        .where(eq(photos.id, row.id));

      updated++;
    }

    offset += BATCH_SIZE;
  }

  console.log(
    `Done. Scanned: ${scanned}, Candidates: ${candidates}, Updated: ${updated}, Mode: ${APPLY ? "apply" : "dry-run"}`,
  );
}

main().catch((error) => {
  console.error("Google Takeout takenAt backfill failed:", error);
  process.exit(1);
});
