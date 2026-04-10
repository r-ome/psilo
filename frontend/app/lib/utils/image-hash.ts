import {
  computePerceptualHashFromPixels,
  hammingDistance,
  PHASH_SIZE,
  type ImageHashData,
} from "@/app/lib/utils/image-hash-core";

type WorkerRequest = {
  id: number;
  file: File;
  maxDim: number;
};

type WorkerResponse = {
  id: number;
  result: ImageHashData | null;
  error?: string;
};

let workerInstance: Worker | null = null;
let requestId = 0;
const pendingRequests = new Map<
  number,
  {
    resolve: (value: ImageHashData | null) => void;
    reject: (error: Error) => void;
  }
>();

function computePerceptualHash(img: HTMLImageElement): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = PHASH_SIZE;
  canvas.height = PHASH_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, PHASH_SIZE, PHASH_SIZE);

  const imageData = ctx.getImageData(0, 0, PHASH_SIZE, PHASH_SIZE);
  const grayscale = new Uint8ClampedArray(PHASH_SIZE * PHASH_SIZE);

  for (let i = 0; i < grayscale.length; i++) {
    const offset = i * 4;
    const r = imageData.data[offset] ?? 0;
    const g = imageData.data[offset + 1] ?? 0;
    const b = imageData.data[offset + 2] ?? 0;
    grayscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  return computePerceptualHashFromPixels(grayscale);
}

function buildMainThreadImageHashData(
  file: File,
  maxDim = 200,
): Promise<ImageHashData | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null);

  return new Promise((resolve) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);

      const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      const imageData = dataUrl.split(",")[1] ?? null;
      if (!imageData) {
        resolve(null);
        return;
      }

      const perceptualHash = computePerceptualHash(img);
      if (!perceptualHash) {
        resolve(null);
        return;
      }

      resolve({ imageData, perceptualHash });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };

    img.src = objectUrl;
  });
}

function getWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return null;
  }

  if (workerInstance) {
    return workerInstance;
  }

  try {
    workerInstance = new Worker(
      new URL("../../workers/image-hash.worker.ts", import.meta.url),
      { type: "module" },
    );

    workerInstance.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const { id, result, error } = event.data;
      const pending = pendingRequests.get(id);
      if (!pending) return;
      pendingRequests.delete(id);

      if (error) {
        pending.reject(new Error(error));
        return;
      }

      pending.resolve(result);
    });

    workerInstance.addEventListener("error", () => {
      const error = new Error("Image hash worker failed");
      for (const pending of pendingRequests.values()) {
        pending.reject(error);
      }
      pendingRequests.clear();
      workerInstance?.terminate();
      workerInstance = null;
    });

    return workerInstance;
  } catch {
    workerInstance = null;
    return null;
  }
}

async function buildWorkerImageHashData(
  file: File,
  maxDim = 200,
): Promise<ImageHashData | null> {
  const worker = getWorker();
  if (!worker || !file.type.startsWith("image/")) return null;

  const id = ++requestId;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });

    try {
      const request: WorkerRequest = { id, file, maxDim };
      worker.postMessage(request);
    } catch (error) {
      pendingRequests.delete(id);
      reject(error instanceof Error ? error : new Error("Failed to post image hash request"));
    }
  });
}

/**
 * Browser-only utility. Uses a worker when available and falls back to the
 * main thread implementation if the worker cannot be started.
 */
export async function getImageHashData(
  file: File,
  maxDim = 200,
): Promise<ImageHashData | null> {
  if (!file.type.startsWith("image/")) return null;

  try {
    const workerResult = await buildWorkerImageHashData(file, maxDim);
    if (workerResult) return workerResult;
  } catch {
    // Fall back to the main thread path below.
  }

  return buildMainThreadImageHashData(file, maxDim);
}

export { hammingDistance };

export async function getImageDataForHash(
  file: File,
  maxDim = 200,
): Promise<string | null> {
  const hashData = await getImageHashData(file, maxDim);
  return hashData?.imageData ?? null;
}
