# ADR-008: SQS for Asynchronous Photo Metadata Processing

## Status

Accepted

## Context

When a user uploads a photo to S3, metadata needs to be extracted — EXIF data (camera model, GPS coordinates, capture time), image dimensions, and format. This requires loading the image into memory using `sharp`, which is CPU and memory-intensive and can take several seconds for large files.

The question is: where and when should this processing happen?

Two broad approaches were considered: process metadata **synchronously** as part of the upload flow, or process it **asynchronously** after the upload completes.

## Decision

Use an SQS queue as a buffer between S3 and the metadata processing Lambda. S3 ObjectCreated events on the `users/` prefix publish to the queue. The `process-photo-metadata` Lambda consumes from the queue. A dead-letter queue (DLQ) captures messages that fail after 3 attempts, handled by `handle-upload-dlq`.

## Alternatives Considered

**1. Synchronous processing in the presigned URL handler**
The Lambda that generates the presigned URL could trigger metadata extraction after the client confirms the upload. This is rejected because the presigned URL Lambda has no way to know when the S3 PUT completes — it only generates the URL, the client uploads directly to S3.

**2. Client calls a separate `/photos/process` endpoint after upload**
The frontend could call a post-upload API to trigger processing. This is rejected because it makes the client responsible for a server-side concern, introduces failure cases if the client drops the call (tab close, network drop), and couples UI flow to background processing.

**3. Direct S3-to-Lambda trigger (no SQS)**
S3 can invoke a Lambda directly on ObjectCreated. This is simpler but provides no retry mechanism — if the Lambda fails, the event is lost. SQS adds a configurable retry policy (3 attempts with visibility timeout) and a DLQ for observability into failed jobs.

**4. EventBridge**
EventBridge supports S3 event routing and is more powerful for complex event routing across services. Rejected as overkill for a single consumer — SQS is simpler and sufficient here.

## Reasons

- Decouples the upload flow from processing. The user gets a fast upload experience; metadata extraction happens in the background.
- `sharp` requires 3008 MB of memory and up to 300 seconds. Running this inline would block API responses and hit Lambda timeout limits on the API Gateway (29s max).
- SQS provides built-in retry with visibility timeout (310s, aligned to Lambda timeout). Failed messages after 3 retries go to the DLQ for inspection rather than being silently dropped.
- The DLQ + `handle-upload-dlq` Lambda provides an explicit failure handling path and a hook for future alerting.

## Consequences

- Photo metadata (`width`, `height`, `format`, `takenAt`, `status`) is not immediately available after upload. The frontend must handle a `pending` status state.
- Two additional Lambda functions to maintain (`process-photo-metadata`, `handle-upload-dlq`).
- SQS visibility timeout (310s) must stay aligned with the Lambda timeout (300s) to prevent duplicate processing.
- DLQ retention (14 days) gives a window to investigate and replay failed messages if needed.
