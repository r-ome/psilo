import { formatDuration, formatStorage } from "@/app/lib/utils";

describe("formatStorage", () => {
  it("formats values below 1 GB as MB", () => {
    expect(formatStorage(25 * 1024 * 1024)).toBe("25.00 MB");
  });

  it("formats values at or above 1 GB as GB", () => {
    expect(formatStorage(1024 ** 3)).toBe("1.00 GB");
    expect(formatStorage(3.5 * 1024 ** 3)).toBe("3.50 GB");
  });

  it("formats durations in a short human-readable form", () => {
    expect(formatDuration(12)).toBe("12s");
    expect(formatDuration(75)).toBe("1m 15s");
    expect(formatDuration(3_660)).toBe("1h 1m");
  });
});
