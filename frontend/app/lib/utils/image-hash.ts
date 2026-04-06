export type ImageHashData = {
  imageData: string;
  perceptualHash: string;
};

const PHASH_SIZE = 32;
const PHASH_BLOCK_SIZE = 8;

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computePerceptualHashFromPixels(pixels: Uint8ClampedArray): string {
  const dct: number[][] = Array.from({ length: PHASH_SIZE }, () =>
    new Array(PHASH_SIZE).fill(0),
  );

  for (let u = 0; u < PHASH_SIZE; u++) {
    for (let v = 0; v < PHASH_SIZE; v++) {
      let sum = 0;
      for (let x = 0; x < PHASH_SIZE; x++) {
        for (let y = 0; y < PHASH_SIZE; y++) {
          sum +=
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * PHASH_SIZE)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * PHASH_SIZE)) *
            pixels[x * PHASH_SIZE + y];
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct[u][v] = (2 / PHASH_SIZE) * cu * cv * sum;
    }
  }

  const block: number[] = [];
  for (let u = 0; u < PHASH_BLOCK_SIZE; u++) {
    for (let v = 0; v < PHASH_BLOCK_SIZE; v++) {
      if (u === 0 && v === 0) continue;
      block.push(dct[u][v]);
    }
  }

  const median = computeMedian(block);

  let hashBits = "";
  for (let u = 0; u < PHASH_BLOCK_SIZE; u++) {
    for (let v = 0; v < PHASH_BLOCK_SIZE; v++) {
      hashBits += dct[u][v] >= median ? "1" : "0";
    }
  }

  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(hashBits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

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

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    distance += xor
      .toString(2)
      .split("")
      .filter((char) => char === "1").length;
  }
  return distance;
}

/**
 * Browser-only utility. Downscales an image file to 200×200 using canvas
 * and returns a base64-encoded JPEG string suitable for pHash computation.
 * Returns null for non-image files.
 */
export async function getImageHashData(
  file: File,
  maxDim = 200,
): Promise<ImageHashData | null> {
  if (!file.type.startsWith("image/")) return null;

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

      // Export as JPEG base64 (strip the data URL prefix)
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

export async function getImageDataForHash(
  file: File,
  maxDim = 200,
): Promise<string | null> {
  const hashData = await getImageHashData(file, maxDim);
  return hashData?.imageData ?? null;
}
