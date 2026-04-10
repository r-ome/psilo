export type ImageHashData = {
  imageData: string;
  perceptualHash: string;
};

export const PHASH_SIZE = 32;
export const PHASH_BLOCK_SIZE = 8;

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computePerceptualHashFromPixels(pixels: Uint8ClampedArray): string {
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
