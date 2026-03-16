# ADR-014: pHash Perceptual Hashing for Duplicate Photo Detection

## Date

2026-03-16

## Status

Accepted

## Context

Without deduplication, uploading the same photo twice (or uploading similar photos that are slightly cropped, resized, or re-compressed) creates separate S3 objects and DB rows. This results in:

- Wasted Glacier storage (the 90-day minimum billing period means accidental duplicates are expensive to fix retroactively).
- Duplicate entries in the photo grid that the user must manually identify and delete.
- Double processing cost in the `process-photo-metadata` pipeline (Sharp, EXIF, thumbnail generation, tagging).

Exact-hash deduplication (MD5/SHA) catches bit-for-bit identical files but misses near-duplicates: the same photo saved at different quality settings, re-exported from a different application, or slightly cropped produces a completely different cryptographic hash despite being visually identical.

## Decision

Implement **perceptual hashing (pHash)** using a DCT-based (Discrete Cosine Transform) algorithm:

1. **Client-side**: The browser computes a pHash before requesting a presigned upload URL. `app/lib/utils/image-hash.ts` downscales the image to 32×32 using a Canvas element, computes a 2D DCT, extracts the top-left 8×8 frequency block, compares each value to the block median, and encodes the result as a 16-character hex string (64-bit hash).

2. **Server-side**: The `generate-presigned-url` Lambda receives the `phash` with the presign request. It queries all non-deleted photos for the user that have a stored `phash`, computes Hamming distances, and if any existing photo matches within a threshold of ≤ 10 bits, returns `{ status: "duplicate", duplicates: [...] }` instead of a presigned URL.

3. **User resolution via `DuplicateUploadModal`**: The frontend pauses the upload and shows a side-by-side comparison of the incoming file and the matched photo. The user can:
   - **Skip** — cancel the upload of this file
   - **Keep Both** — rename the incoming file (e.g., `photo_1.jpg`) to avoid S3 key collision, then proceed
   - **Replace Existing** — soft-delete the matched photo, then proceed with upload

4. **pHash stored in DB**: After the `process-photo-metadata` Lambda generates the thumbnail, it computes the pHash server-side using `services/shared/phash.ts` (same DCT algorithm, Sharp-based) and stores it in the `phash` column. This populates the hash for future comparisons and serves as the authoritative hash (avoids relying solely on the client-provided value).

The Hamming distance threshold of 10 out of 64 bits (≈15%) was chosen empirically to match photos that have been re-compressed, slightly resized, or had minor edits (brightness/contrast) while excluding genuinely different photos that happen to share similar color distributions.

## Alternatives Considered

**1. Exact hash (MD5 / SHA-256)**
Hash the raw file bytes and reject uploads that match an existing hash exactly.

Rejected because it only catches identical files. Re-exporting a JPEG from a different application, adjusting brightness, or resaving at different quality all produce different cryptographic hashes. The common case of "same photo, different export" would not be caught.

**2. Average Hash (aHash)**
Simpler perceptual hash: resize to 8×8, compare each pixel to the image mean.

Considered but rejected in favor of pHash. aHash is faster but less discriminative — it produces more false positives (flagging different photos as duplicates) because it uses only the average value as the threshold, ignoring frequency information. pHash's DCT-based approach is more robust against minor transformations.

**3. Server-side only detection (no client-side pHash)**
Skip the client-side computation; always send the full file to the server, compute pHash in the Lambda, and return a duplicate response.

Rejected because it wastes bandwidth uploading potentially large files (5–20 MB originals) only to reject them. The client-side pHash catches the duplicate before any file transfer begins.

**4. Deduplicate in `process-photo-metadata` after upload**
Let the upload proceed; check for duplicates during async processing and soft-delete the newer copy if a match is found.

Rejected because it creates a poor UX — the user sees the photo appear in the grid and then disappear. It also wastes S3 storage (even briefly) and incurs unnecessary processing cost. The pre-upload check is strictly better.

**5. Exact S3 key deduplication**
Reject uploads where the filename already exists in S3 for the user.

Rejected because it only catches identical filenames, not identical content with different filenames (e.g., `IMG_1234.jpg` and `IMG_1234_edit.jpg`). The same photo saved under different names would not be caught.

## Reasons

- pHash detects near-duplicates (re-compressed, slightly edited, re-exported) that exact hashing misses — the primary use case.
- Client-side pre-check avoids unnecessary bandwidth consumption before rejection.
- User resolution modal (Skip / Keep Both / Replace) respects user intent — the system flags but does not unilaterally discard the upload.
- Hamming distance comparison is O(n) over the user's photo library and fast enough at personal-project scale (thousands of photos).
- The shared `phash.ts` module (used by both Lambda and client-equivalent logic) ensures consistency between the server-side stored hash and the client-side comparison hash.

## Consequences

- `phash varchar(16)` column and index added to the `photos` table (migrations 0015, 0016).
- `services/shared/phash.ts` exports `computePHash()` and `hammingDistance()` for use in `process-photo-metadata` and `generate-presigned-url`.
- `app/lib/utils/image-hash.ts` provides the browser-side pHash using Canvas API — cannot be imported server-side (requires `window.document`).
- `generate-presigned-url` Lambda now queries the DB before issuing a URL, adding one DB round-trip to the presign latency. Acceptable because `generate-presigned-url` is already latency-tolerant (the user has not started uploading yet).
- The threshold of 10 bits is tunable. False positives (legitimate photos flagged as duplicates) are resolved by the user choosing "Keep Both". False negatives (actual duplicates that slip through) result in the existing behavior — a second copy is created.
- A `scripts/backfill-phash.ts` script populates `phash` for existing photos that pre-date this feature. Must be run once after deploying migration 0015.
- Videos are not checked for duplicates — the client-side Canvas approach only works for images, and video perceptual hashing is significantly more complex.
