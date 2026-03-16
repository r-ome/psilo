import sharp from "sharp";

/**
 * Compute a DCT-based perceptual hash (pHash) for an image buffer.
 * Returns a 16-char hex string representing a 64-bit hash.
 */
export async function computePHash(imageBuffer: Buffer): Promise<string> {
  // Resize to 32×32 greyscale
  const pixels = await sharp(imageBuffer)
    .resize(32, 32, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();

  const size = 32;
  const dct: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));

  // Apply 2D DCT
  for (let u = 0; u < size; u++) {
    for (let v = 0; v < size; v++) {
      let sum = 0;
      for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
          sum +=
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size)) *
            pixels[x * size + y];
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct[u][v] = (2 / size) * cu * cv * sum;
    }
  }

  // Extract top-left 8×8 block (excluding DC component at [0][0])
  const block: number[] = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      if (u === 0 && v === 0) continue;
      block.push(dct[u][v]);
    }
  }

  const median = computeMedian(block);

  // Build 64-bit hash: compare each of 64 values (8×8 block) to median
  let hashBits = "";
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      hashBits += dct[u][v] >= median ? "1" : "0";
    }
  }

  // Convert 64-bit string to 16-char hex
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(hashBits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

function computeMedian(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute the Hamming distance between two 16-char hex pHash strings.
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    distance += xor.toString(2).split("").filter((c) => c === "1").length;
  }
  return distance;
}
