import {
  buildGoogleTakeoutImportPlan,
  inferMediaContentType,
} from "@/app/lib/google-takeout";

describe("google takeout import plan", () => {
  it("matches a media file with its adjacent json sidecar", async () => {
    const photo = new File(["photo"], "IMG_0001.JPG", { type: "image/jpeg" });
    Object.defineProperty(photo, "webkitRelativePath", {
      value: "Takeout/Google Photos/Trip/IMG_0001.JPG",
    });

    const sidecar = new File(["{}"], "IMG_0001.JPG.json", {
      type: "application/json",
    });
    Object.defineProperty(sidecar, "webkitRelativePath", {
      value: "Takeout/Google Photos/Trip/IMG_0001.JPG.json",
    });

    const plan = await buildGoogleTakeoutImportPlan(
      [photo, sidecar],
      "import-123",
    );

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.sidecarFile).toBe(sidecar);
    expect(plan.items[0]?.storageSubFolder).toBe("photos");
    expect(plan.items[0]?.uploadRelativePath).toBe(
      "google-takeout/import-123/Takeout/Google Photos/Trip/IMG_0001.JPG",
    );
    expect(plan.missingSidecarCount).toBe(0);
    expect(plan.unmatchedJsonCount).toBe(0);
  });

  it("falls back to same-directory supplemental metadata filenames", async () => {
    const photo = new File(["photo"], "PXL_20240101_123456789.jpg", {
      type: "image/jpeg",
    });
    Object.defineProperty(photo, "webkitRelativePath", {
      value: "Takeout/Google Photos/PXL_20240101_123456789.jpg",
    });

    const sidecar = new File(["{}"], "PXL_20240101_123456789.jpg.supplemental-metadata.json", {
      type: "application/json",
    });
    Object.defineProperty(sidecar, "webkitRelativePath", {
      value:
        "Takeout/Google Photos/PXL_20240101_123456789.jpg.supplemental-metadata.json",
    });

    const plan = await buildGoogleTakeoutImportPlan(
      [photo, sidecar],
      "import-123",
    );

    expect(plan.items[0]?.sidecarFile).toBe(sidecar);
    expect(plan.missingSidecarCount).toBe(0);
  });

  it("matches by JSON title when the sidecar filename is mangled", async () => {
    const photo = new File(["photo"], "IMG-423312ba37bc80e6620489e95dd008f0-V.jpg", {
      type: "image/jpeg",
    });
    Object.defineProperty(photo, "webkitRelativePath", {
      value:
        "Takeout/Google Photos/Patzie/IMG-423312ba37bc80e6620489e95dd008f0-V.jpg",
    });

    const sidecar = new File(
      [
        JSON.stringify({
          title: "IMG-423312ba37bc80e6620489e95dd008f0-V.jpg",
          photoTakenTime: { timestamp: "1596882193" },
        }),
      ],
      "metadata(1).json",
      { type: "application/json" },
    );
    Object.defineProperty(sidecar, "webkitRelativePath", {
      value: "Takeout/Google Photos/Patzie/metadata(1).json",
    });
    Object.defineProperty(sidecar, "text", {
      value: async () =>
        JSON.stringify({
          title: "IMG-423312ba37bc80e6620489e95dd008f0-V.jpg",
          photoTakenTime: { timestamp: "1596882193" },
        }),
    });

    const plan = await buildGoogleTakeoutImportPlan(
      [photo, sidecar],
      "import-123",
    );

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.sidecarFile).toBe(sidecar);
    expect(plan.missingSidecarCount).toBe(0);
  });

  it("keeps media without sidecars and infers video content type from extension", async () => {
    const video = new File(["video"], "clip.mov", { type: "" });
    Object.defineProperty(video, "webkitRelativePath", {
      value: "Takeout/Google Photos/clip.mov",
    });

    const plan = await buildGoogleTakeoutImportPlan([video], "import-123");

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.sidecarFile).toBeNull();
    expect(plan.items[0]?.contentType).toBe("video/quicktime");
    expect(plan.items[0]?.storageSubFolder).toBe("videos");
    expect(plan.missingSidecarCount).toBe(1);
  });

  it("infers common media content types when the browser does not provide one", () => {
    expect(
      inferMediaContentType(new File(["photo"], "image.heic", { type: "" })),
    ).toBe("image/heic");
    expect(
      inferMediaContentType(new File(["video"], "movie.mp4", { type: "" })),
    ).toBe("video/mp4");
  });
});
