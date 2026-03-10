# ADR-010: Thumbnail Generation for Photo Grid Performance

## Date

2026-03-10

## Status

Accepted

## Context

Photos are stored in S3 Glacier Flexible Retrieval (ADR-004). Glacier objects cannot be served directly — they require a restore request and a wait of 1–5 minutes (Expedited) or 3–5 hours (Standard) before a presigned URL can generate a usable response.

This creates a fundamental problem for the photo grid UI: if every thumbnail in the grid requires a Glacier restore, the dashboard becomes unusable — users would see empty placeholders for minutes while restores complete, even just to browse their library.

Additionally, original photos can be 5–20 MB each. Serving full-resolution images in a grid of 20–50 items would be extremely slow even if they were in Standard storage.

## Decision

During the `process-photo-metadata` pipeline (triggered by SQS on upload), generate an 800×800 JPEG thumbnail for every photo using `sharp`. Store the thumbnail at `users/{userId}/thumbnails/{filename}` in S3 Standard storage. Store the thumbnail's S3 key (`thumbnailKey`) and file size (`thumbnailSize`) in the `photos` table.

Original photos are tagged with `media-type=original` during the same pipeline step. An S3 lifecycle rule transitions objects with this tag to Glacier after a configurable period.

The `manage-photos` Lambda returns a signed URL for the `thumbnailKey` (not the original `s3Key`) when listing photos. The frontend `PhotoGrid` and `ImageViewer` use `thumbnailUrl` for display.

For videos, no thumbnail is generated yet — a signed URL for the original `s3Key` is returned instead.

## Alternatives Considered

**1. Serve originals from S3 Standard and transition to Glacier later**
Store all originals in Standard on upload; rely on lifecycle rules to move them to Glacier after N days. Thumbnails would not be needed because Standard allows direct presigned URL access.

Rejected because originals in Standard are ~5.5x more expensive per GB than Glacier. Even a short window (e.g., 30 days) before transition means paying Standard rates for every newly uploaded photo for a month, which defeats the cost optimization goal.

**2. Restore from Glacier on-demand per photo view**
Keep originals in Glacier, initiate a restore when the user opens the grid, and poll until restored.

Rejected because the grid displays 20–50 photos at once. Initiating 20–50 parallel restore requests on every dashboard load is expensive (Expedited restore fee per GB), slow (1–5 minute wait), and creates a poor UX. This approach may be acceptable for full-resolution download of individual photos, but not for browsing.

**3. CloudFront + Lambda@Edge for on-the-fly resizing**
Serve originals through CloudFront with Lambda@Edge performing real-time image resizing. Standard originals cached at edge, resized variants returned on first request.

Rejected because it requires CloudFront and Lambda@Edge (additional cost, complexity), and still requires originals to remain in Standard for direct access by the edge function — same cost problem as option 1.

**4. Store both Standard and Glacier copies**
Keep a Standard copy for thumbnail generation, then delete it after the thumbnail is produced.

Operationally complex — requires two-phase cleanup. The thumbnail approach achieves the same result with a single, permanently cheap artifact.

## Reasons

- Thumbnails are small (~30–80 KB for an 800×800 JPEG), so the Standard storage cost is negligible even for large libraries.
- Thumbnails can be served instantly via presigned URL without any restore step.
- Originals remain safe in Glacier for full-resolution retrieval when needed (e.g., download, future restore feature).
- The generation happens asynchronously in `process-photo-metadata`, so upload speed is unaffected.
- 800×800 is sufficient for a grid display and retina screens at standard grid sizes; it reduces bandwidth significantly compared to full-resolution originals.

## Consequences

- Thumbnails stored in Standard add a small ongoing storage cost for the thumbnail set. At ~50 KB average per thumbnail, 10,000 photos ≈ 500 MB ≈ ~$0.01/month — negligible.
- `process-photo-metadata` Lambda requires `sharp` (native binary) bundled as a layer/nodeModule. `sharp` must be in `infrastructure/package.json` devDependencies for CDK bundling (`nodeModules: ['sharp']`).
- Photos in the `pending` status (before `process-photo-metadata` completes) have no `thumbnailKey`. The frontend must handle null `thumbnailUrl` gracefully.
- Videos do not have thumbnails yet — the frontend conditionally renders a `<video>` element using the signed URL of the original instead.
- `thumbnailKey` and `thumbnailSize` columns added to the `photos` table (migration 0007/0009).
