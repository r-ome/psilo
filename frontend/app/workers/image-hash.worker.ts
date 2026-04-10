import {
  computePerceptualHashFromPixels,
  PHASH_SIZE,
  type ImageHashData,
} from "../lib/utils/image-hash-core";

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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

async function buildImageHashData(
  file: File,
  maxDim = 200,
): Promise<ImageHashData | null> {
  if (!file.type.startsWith("image/")) return null;
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    return null;
  }

  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const exportCanvas = new OffscreenCanvas(width, height);
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) return null;
    exportCtx.drawImage(bitmap, 0, 0, width, height);

    const blob = await exportCanvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.6,
    });
    const dataUrl = await blobToDataUrl(blob);
    const imageData = dataUrl.split(",")[1] ?? null;
    if (!imageData) return null;

    const phashCanvas = new OffscreenCanvas(PHASH_SIZE, PHASH_SIZE);
    const phashCtx = phashCanvas.getContext("2d");
    if (!phashCtx) return null;
    phashCtx.drawImage(bitmap, 0, 0, PHASH_SIZE, PHASH_SIZE);

    const imageDataPixels = phashCtx.getImageData(0, 0, PHASH_SIZE, PHASH_SIZE);
    const grayscale = new Uint8ClampedArray(PHASH_SIZE * PHASH_SIZE);

    for (let i = 0; i < grayscale.length; i++) {
      const offset = i * 4;
      const r = imageDataPixels.data[offset] ?? 0;
      const g = imageDataPixels.data[offset + 1] ?? 0;
      const b = imageDataPixels.data[offset + 2] ?? 0;
      grayscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    const perceptualHash = computePerceptualHashFromPixels(grayscale);
    return { imageData, perceptualHash };
  } finally {
    bitmap.close?.();
  }
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const { id, file, maxDim } = event.data;
  try {
    const result = await buildImageHashData(file, maxDim);
    const response: WorkerResponse = { id, result };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      result: null,
      error: error instanceof Error ? error.message : "Image hash worker failed",
    };
    self.postMessage(response);
  }
});
