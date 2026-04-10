import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import path from "node:path";
import { createDb } from "../../shared/db";
import { photos, users } from "../../shared/schema";
import { computePHash, hammingDistance } from "../../shared/phash";
import { getPrivateKey, cfSignedUrl } from "../../shared/cloudfront";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;
const PHASH_THRESHOLD = 10;
const PHASH_PAGE_SIZE = 1000;

type PhotoHashRow = {
  id: string;
  phash: string | null;
};

type PhotoDetailRow = {
  id: string;
  filename: string;
  thumbnailKey: string | null;
  s3Key: string;
};

type DuplicateMatch = {
  id: string;
  filename: string;
  thumbnailUrl: string | null;
  s3Key: string;
  distance: number;
};

type UploadCheckInput = {
  filename: string;
  contentType: string;
  contentLength?: number;
  relativePath?: string;
  storageSubFolder?: "photos" | "videos";
  imageData?: string;
  perceptualHash?: string;
};

type PreflightItem = UploadCheckInput & {
  clientId: string;
};

type UserQuotaSnapshot = {
  currentUsageBytes: number;
  limitBytes: number | null;
  plan: string | null;
};

function sanitizeRelativePath(relativePath: string): string | null {
  const normalized = path.posix.normalize(relativePath.replace(/\\/g, "/"));
  const segments = normalized
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");

  if (segments.some((segment) => segment === "..")) {
    return null;
  }

  return segments.join("/");
}

function normalizeImportPath(pathValue: string): string {
  return pathValue.replace(
    /\/google-takeout\/[0-9a-fA-F-]+\//,
    "/google-takeout/",
  );
}

async function buildDuplicateMatches(rows: PhotoDetailRow[]): Promise<DuplicateMatch[]> {
  if (rows.length === 0) {
    return [];
  }

  const privateKey = await getPrivateKey();
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      filename: row.filename,
      thumbnailUrl: row.thumbnailKey
        ? await cfSignedUrl(row.thumbnailKey, privateKey)
        : null,
      s3Key: row.s3Key,
      distance: 0,
    })),
  );
}

async function findDuplicatePhotos(
  db: ReturnType<typeof createDb>,
  userId: string,
  incomingHash: string,
): Promise<DuplicateMatch[]> {
  const matchingDistances = new Map<string, number>();
  let cursor = "";

  for (;;) {
    const conditions = [
      eq(photos.userId, userId),
      isNotNull(photos.phash),
      isNull(photos.deletedAt),
    ];
    if (cursor) {
      conditions.push(gt(photos.id, cursor));
    }

    const hashRows = await db
      .select({
        id: photos.id,
        phash: photos.phash,
      })
      .from(photos)
      .orderBy(asc(photos.id))
      .limit(PHASH_PAGE_SIZE)
      .where(and(...conditions));

    if (hashRows.length === 0) break;

    for (const row of hashRows as PhotoHashRow[]) {
      if (!row.phash) continue;
      const distance = hammingDistance(incomingHash, row.phash);
      if (distance <= PHASH_THRESHOLD) {
        matchingDistances.set(row.id, distance);
      }
    }

    cursor = hashRows[hashRows.length - 1].id;
    if (hashRows.length < PHASH_PAGE_SIZE) break;
  }

  if (matchingDistances.size === 0) {
    return [];
  }

  const matchedIds = Array.from(matchingDistances.keys());
  const detailRows = await db
    .select({
      id: photos.id,
      filename: photos.filename,
      thumbnailKey: photos.thumbnailKey,
      s3Key: photos.s3Key,
    })
    .from(photos)
    .where(
      and(
        eq(photos.userId, userId),
        isNull(photos.deletedAt),
        inArray(photos.id, matchedIds),
      ),
    );

  const matches = await buildDuplicateMatches(detailRows as PhotoDetailRow[]);
  for (const match of matches) {
    match.distance = matchingDistances.get(match.id) ?? Number.MAX_SAFE_INTEGER;
  }

  matches.sort((a, b) => a.distance - b.distance);
  return matches;
}

async function findRelativePathDuplicates(
  db: ReturnType<typeof createDb>,
  userId: string,
  objectPath: string,
): Promise<DuplicateMatch[]> {
  const normalizedIncomingObjectPath = normalizeImportPath(objectPath);

  const exactMatches = await db
    .select({
      id: photos.id,
      filename: photos.filename,
      thumbnailKey: photos.thumbnailKey,
      s3Key: photos.s3Key,
    })
    .from(photos)
    .where(
      and(
        eq(photos.userId, userId),
        eq(photos.normalizedImportPath, normalizedIncomingObjectPath),
        isNull(photos.deletedAt),
      ),
    );

  return buildDuplicateMatches(exactMatches as PhotoDetailRow[]);
}

function resolveSubFolder(contentType: string, storageSubFolder?: "photos" | "videos") {
  return storageSubFolder ?? (contentType.startsWith("video/") ? "videos" : "photos");
}

function resolveObjectPath(relativePath: string | null, filename: string) {
  return relativePath ?? filename;
}

function validateUploadInput({
  filename,
  contentType,
  storageSubFolder,
  relativePath,
}: UploadCheckInput): { safeRelativePath: string | null } | { error: APIGatewayProxyResultV2 } {
  if (!filename || !contentType) {
    return {
      error: {
        statusCode: 400,
        body: JSON.stringify({
          message: "filename and contentType are required",
        }),
      },
    };
  }

  if (
    storageSubFolder &&
    storageSubFolder !== "photos" &&
    storageSubFolder !== "videos"
  ) {
    return {
      error: {
        statusCode: 400,
        body: JSON.stringify({
          message: "storageSubFolder must be photos or videos",
        }),
      },
    };
  }

  const safeRelativePath = relativePath
    ? sanitizeRelativePath(relativePath)
    : null;

  if (relativePath && !safeRelativePath) {
    return {
      error: {
        statusCode: 400,
        body: JSON.stringify({
          message: "relativePath must stay within the user upload directory",
        }),
      },
    };
  }

  return { safeRelativePath };
}

async function loadUserQuotaSnapshot(
  db: ReturnType<typeof createDb>,
  userId: string,
): Promise<UserQuotaSnapshot> {
  const [userRow] = await db
    .select({ plan: users.plan, storageLimitBytes: users.storageLimitBytes })
    .from(users)
    .where(eq(users.id, userId));

  if (!userRow || userRow.plan === "on_demand" || userRow.storageLimitBytes == null) {
    return {
      currentUsageBytes: 0,
      limitBytes: null,
      plan: userRow?.plan ?? null,
    };
  }

  const [usageRow] = await db
    .select({ totalBytes: sql<number>`COALESCE(SUM(${photos.size}), 0)` })
    .from(photos)
    .where(and(eq(photos.userId, userId), isNull(photos.deletedAt)));

  return {
    currentUsageBytes: Number(usageRow?.totalBytes ?? 0),
    limitBytes: Number(userRow.storageLimitBytes),
    plan: userRow.plan,
  };
}

async function findMatchesForInput(
  db: ReturnType<typeof createDb>,
  userId: string,
  input: UploadCheckInput,
  safeRelativePath: string | null,
): Promise<DuplicateMatch[]> {
  const subFolder = resolveSubFolder(input.contentType, input.storageSubFolder);
  const objectPath = resolveObjectPath(safeRelativePath, input.filename);

  if (safeRelativePath) {
    const matches = await findRelativePathDuplicates(
      db,
      userId,
      `${subFolder}/${objectPath}`,
    );

    if (matches.length > 0) {
      return matches;
    }
  }

  let incomingHash = input.perceptualHash ?? null;

  if (!incomingHash && input.imageData && input.contentType.startsWith("image/")) {
    const imageBuffer = Buffer.from(input.imageData, "base64");
    incomingHash = await computePHash(imageBuffer);
  }

  if (!incomingHash || !input.contentType.startsWith("image/")) {
    return [];
  }

  return findDuplicatePhotos(db, userId, incomingHash);
}

async function findPreflightMatchesForInput(
  db: ReturnType<typeof createDb>,
  userId: string,
  input: UploadCheckInput,
  safeRelativePath: string | null,
): Promise<DuplicateMatch[]> {
  if (!safeRelativePath) {
    return [];
  }

  const subFolder = resolveSubFolder(input.contentType, input.storageSubFolder);
  const objectPath = resolveObjectPath(safeRelativePath, input.filename);

  return findRelativePathDuplicates(
    db,
    userId,
    `${subFolder}/${objectPath}`,
  );
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const claims = event.requestContext.authorizer.jwt.claims;
  const userId = claims.sub as string;
  const givenName = (claims.given_name as string) ?? '';
  const familyName = (claims.family_name as string) ?? '';
  const body = JSON.parse(event.body ?? "{}");
  const db = createDb();

  if (event.rawPath?.endsWith("/preflight")) {
    const items = (body as { items?: unknown }).items;
    if (!Array.isArray(items)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "items must be an array" }),
      };
    }

    const quotaSnapshot = await loadUserQuotaSnapshot(db, userId);
    let projectedUsageBytes = quotaSnapshot.currentUsageBytes;
    const results: Array<
      | { clientId: string; status: "new" }
      | { clientId: string; status: "duplicate"; duplicates: DuplicateMatch[] }
      | {
          clientId: string;
          status: "quota_exceeded";
          currentUsageBytes: number;
          limitBytes: number;
          plan: string | null;
        }
    > = [];

    for (const candidate of items as PreflightItem[]) {
      const validation = validateUploadInput(candidate);
      if ("error" in validation) {
        return validation.error;
      }

      const incomingBytes = Number(candidate.contentLength ?? 0);
      if (
        quotaSnapshot.limitBytes != null &&
        projectedUsageBytes + incomingBytes > quotaSnapshot.limitBytes
      ) {
        results.push({
          clientId: candidate.clientId,
          status: "quota_exceeded",
          currentUsageBytes: projectedUsageBytes,
          limitBytes: quotaSnapshot.limitBytes,
          plan: quotaSnapshot.plan,
        });
        continue;
      }

      try {
        const matches = await findPreflightMatchesForInput(
          db,
          userId,
          candidate,
          validation.safeRelativePath,
        );

        if (matches.length > 0) {
          results.push({
            clientId: candidate.clientId,
            status: "duplicate",
            duplicates: matches,
          });
          continue;
        }
      } catch (err) {
        console.warn("Batch preflight duplicate check failed for item, marking as new:", err);
      }

      results.push({ clientId: candidate.clientId, status: "new" });
      projectedUsageBytes += incomingBytes;
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    };
  }

  const {
    filename,
    contentType,
    imageData,
    contentLength,
    relativePath,
    storageSubFolder,
  } = body as UploadCheckInput;

  const validation = validateUploadInput({
    filename,
    contentType,
    imageData,
    contentLength,
    relativePath,
    storageSubFolder,
  });
  if ("error" in validation) {
    return validation.error;
  }

  const quotaSnapshot = await loadUserQuotaSnapshot(db, userId);
  const incomingBytes = Number(contentLength ?? 0);
  if (
    quotaSnapshot.limitBytes != null &&
    quotaSnapshot.currentUsageBytes + incomingBytes > quotaSnapshot.limitBytes
  ) {
    return {
      statusCode: 403,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "quota_exceeded",
        currentUsageBytes: quotaSnapshot.currentUsageBytes,
        limitBytes: quotaSnapshot.limitBytes,
        plan: quotaSnapshot.plan,
      }),
    };
  }

  const userPrefix = givenName && familyName
    ? `${givenName}-${familyName}-${userId}`
    : userId;
  const subFolder = resolveSubFolder(contentType, storageSubFolder);
  const objectPath = resolveObjectPath(validation.safeRelativePath, filename);

  try {
    const matches = await findMatchesForInput(
      db,
      userId,
      {
        filename,
        contentType,
        imageData,
        contentLength,
        relativePath,
        storageSubFolder,
      },
      validation.safeRelativePath,
    );

    if (matches.length > 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "duplicate", duplicates: matches }),
      };
    }
  } catch (err) {
    console.warn("pHash duplicate check failed, proceeding with upload:", err);
  }

  const key = `users/${userPrefix}/${subFolder}/${objectPath}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ok", url, key }),
  };
};
