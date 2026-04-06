import { hammingDistance } from "@/app/lib/utils/image-hash";

describe("hammingDistance", () => {
  it("treats visually similar sample pHashes as close matches", () => {
    expect(hammingDistance("d3ff971c0e20a5c3", "c3ff971c0e22a5c3")).toBe(2);
  });

  it("treats very different hashes as distant", () => {
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
  });
});
