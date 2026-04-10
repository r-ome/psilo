import { getPhotoVersionGroupKey } from "@/app/lib/photo-versions";

export type StorageSubFolder = "photos" | "videos";

export interface GoogleTakeoutImportItem {
  id: string;
  mediaFile: File;
  sidecarFile: File | null;
  contentType: string;
  storageSubFolder: StorageSubFolder;
  originalRelativePath: string;
  uploadRelativePath: string;
}

export interface GoogleTakeoutImportPlan {
  items: GoogleTakeoutImportItem[];
  missingSidecarCount: number;
  unmatchedJsonCount: number;
}

interface GoogleTakeoutSidecarFile {
  file: File;
  relativePath: string;
  directory: string;
  filenameMatchKey: string;
  titleMatchKey: string | null;
  siblingMatchKey: string;
  titleSiblingMatchKey: string | null;
}

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "heic",
  "heif",
  "bmp",
  "tif",
  "tiff",
  "avif",
]);

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "m4v",
  "webm",
  "avi",
  "mkv",
  "3gp",
  "mpeg",
  "mpg",
]);

const JSON_PARSE_BATCH_SIZE = 50;

function normalizeRelativePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/");
}

function getRelativePath(file: File): string {
  const withRelativePath = file as File & { webkitRelativePath?: string };
  return withRelativePath.webkitRelativePath || file.name;
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot === -1 ? "" : filename.slice(lastDot + 1).toLowerCase();
}

export function inferMediaContentType(file: File): string | null {
  if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
    return file.type;
  }

  const extension = getFileExtension(file.name);

  if (IMAGE_EXTENSIONS.has(extension)) {
    if (extension === "jpg") return "image/jpeg";
    if (extension === "tif") return "image/tiff";
    return `image/${extension}`;
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    if (extension === "mov") return "video/quicktime";
    if (extension === "3gp") return "video/3gpp";
    return `video/${extension}`;
  }

  return null;
}

function stripJsonSuffix(filename: string): string {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".supplemental-metadata.json")) {
    return filename.slice(0, -".supplemental-metadata.json".length);
  }

  if (lower.endsWith(".json")) {
    return filename.slice(0, -".json".length);
  }

  return filename;
}

function getDirectory(relativePath: string): string {
  return relativePath
    .split("/")
    .slice(0, -1)
    .join("/")
    .toLowerCase();
}

function createMatchKey(filename: string): string {
  return filename.trim().toLowerCase();
}

function createSiblingMatchKey(filename: string): string {
  return getPhotoVersionGroupKey(filename);
}

async function readJsonTitle(file: File): Promise<string | null> {
  try {
    const text =
      typeof file.text === "function"
        ? await file.text()
        : typeof file.arrayBuffer === "function"
          ? new TextDecoder().decode(await file.arrayBuffer())
          : await new Response(file).text();
    const parsed = JSON.parse(text) as { title?: unknown };

    if (typeof parsed.title !== "string" || parsed.title.trim().length === 0) {
      return null;
    }

    return parsed.title;
  } catch {
    return null;
  }
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map(mapper));
    results.push(...batchResults);
  }

  return results;
}

function findMatchingSidecar(
  mediaRelativePath: string,
  jsonFilesByPath: Map<string, GoogleTakeoutSidecarFile>,
  jsonFilesByDirectory: Map<string, GoogleTakeoutSidecarFile[]>,
): GoogleTakeoutSidecarFile | null {
  const exactMatch = jsonFilesByPath.get(`${mediaRelativePath.toLowerCase()}.json`);
  if (exactMatch) return exactMatch;

  const segments = mediaRelativePath.split("/");
  const filename = segments[segments.length - 1] ?? mediaRelativePath;
  const directory = getDirectory(mediaRelativePath);
  const candidates = jsonFilesByDirectory.get(directory) ?? [];
  const matchKey = createMatchKey(filename);
  const siblingMatchKey = createSiblingMatchKey(filename);

  return (
    candidates.find(
      (candidate) => candidate.filenameMatchKey === matchKey,
    ) ??
    candidates.find(
      (candidate) => candidate.titleMatchKey === matchKey,
    ) ?? null
  ) ??
    candidates.find(
      (candidate) => candidate.siblingMatchKey === siblingMatchKey,
    ) ??
    candidates.find(
      (candidate) => candidate.titleSiblingMatchKey === siblingMatchKey,
    ) ?? null;
}

export async function buildGoogleTakeoutImportPlan(
  files: File[],
  importId: string,
): Promise<GoogleTakeoutImportPlan> {
  const jsonFilesByPath = new Map<string, GoogleTakeoutSidecarFile>();
  const jsonFilesByDirectory = new Map<string, GoogleTakeoutSidecarFile[]>();
  const mediaFiles: Array<{ file: File; relativePath: string; contentType: string }> = [];
  const jsonFiles: Array<{ file: File; relativePath: string }> = [];

  for (const file of files) {
    const relativePath = normalizeRelativePath(getRelativePath(file));

    if (!relativePath) continue;

    const lowerPath = relativePath.toLowerCase();

    if (lowerPath.endsWith(".json")) {
      jsonFiles.push({ file, relativePath });
      continue;
    }

    const contentType = inferMediaContentType(file);
    if (!contentType) continue;

    mediaFiles.push({ file, relativePath, contentType });
  }

  const jsonCandidates = await mapInBatches(
    jsonFiles,
    JSON_PARSE_BATCH_SIZE,
    async ({ file, relativePath }) => {
      const title = await readJsonTitle(file);

      return {
        file,
        relativePath,
        directory: getDirectory(relativePath),
        filenameMatchKey: createMatchKey(stripJsonSuffix(file.name)),
        titleMatchKey: title ? createMatchKey(title) : null,
        siblingMatchKey: createSiblingMatchKey(stripJsonSuffix(file.name)),
        titleSiblingMatchKey: title ? createSiblingMatchKey(title) : null,
      } satisfies GoogleTakeoutSidecarFile;
    },
  );

  for (const candidate of jsonCandidates) {
    jsonFilesByPath.set(candidate.relativePath.toLowerCase(), candidate);
    const existing = jsonFilesByDirectory.get(candidate.directory) ?? [];
    existing.push(candidate);
    jsonFilesByDirectory.set(candidate.directory, existing);
  }

  const usedJsonFiles = new Set<string>();
  const items = mediaFiles.map(({ file, relativePath, contentType }, index) => {
    const sidecarFile = findMatchingSidecar(
      relativePath,
      jsonFilesByPath,
      jsonFilesByDirectory,
    );

    if (sidecarFile) {
      usedJsonFiles.add(sidecarFile.relativePath);
    }

    return {
      id: `${index}-${file.name}-${file.size}-${file.lastModified}`,
      mediaFile: file,
      sidecarFile: sidecarFile?.file ?? null,
      contentType,
      storageSubFolder: contentType.startsWith("video/")
        ? "videos"
        : "photos" as StorageSubFolder,
      originalRelativePath: relativePath,
      uploadRelativePath: normalizeRelativePath(
        `google-takeout/${importId}/${relativePath}`,
      ),
    };
  });

  return {
    items,
    missingSidecarCount: items.filter((item) => item.sidecarFile == null).length,
    unmatchedJsonCount: jsonCandidates.filter(
      (candidate) => !usedJsonFiles.has(candidate.relativePath),
    ).length,
  };
}
