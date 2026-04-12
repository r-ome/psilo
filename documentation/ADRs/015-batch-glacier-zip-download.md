# ADR-015: ECS Fargate Zip Pipeline for Batch Glacier Downloads

## Date

2026-03-16

## Status

Accepted

## Context

ADR-004 established Glacier Flexible Retrieval as the storage tier for original photos. The initial download flow (documented implicitly in the restore feature) handled each photo independently:

- Each Glacier restore completes asynchronously → EventBridge fires → `handle-restore-completed` Lambda → individual SES email with a 7-day presigned URL per file.

This works for downloading a handful of photos. For album-level downloads (potentially hundreds of files), it breaks down:

1. **Email flood**: downloading a 200-photo album triggers 200 separate SES emails. Users receive hundreds of individual "Your photo is ready" emails and must click each link individually.
2. **Uncoordinated delivery**: files complete their individual 1–5 minute (Expedited) or 3–5 hour (Standard) restores at different times. The user has no single point of completion.
3. **Presigned URL expiry drift**: URLs generated at different times have different 7-day expiry windows, making organized download difficult.

The existing `retrieval_batches` / `retrieval_requests` tracking tables (ADR not written — added 2026-03-11) already group individual restore requests under a batch. The missing piece is: once all files in a batch are restored, automatically produce a single zip file and give the user one download link.

## Decision

Add a **zip pipeline** triggered after all files in a zip-flow Glacier batch are fully restored. In the current implementation, zip flow covers non-`SINGLE` batches (`ALBUM` and `MANUAL`):

### SNS + `handle-glacier-job-complete` Lambda

When S3 completes a Glacier restore, it emits an "Object Restore Completed" event. For **zip-flow batches** (non-`SINGLE` types), this event is routed via SNS to a new `handle-glacier-job-complete` Lambda instead of being handled by the single-file email flow.

The Lambda (scoped to non-SINGLE batches — SINGLE batches are owned by the email flow):
1. Finds ALL `IN_PROGRESS` requests for the restored key across non-SINGLE batches
2. Marks all matching requests as `status=READY` in a single update
3. For each affected batch, counts remaining `IN_PROGRESS` requests
4. When a batch's count reaches zero → atomically flips batch `IN_PROGRESS` → `ZIPPING` (only one concurrent Lambda invocation wins the race) → calls `ecs.RunTask` to launch the zip-processor Fargate container

The atomic "check count + flip status" step prevents two concurrent SNS deliveries from both triggering the Fargate task. The non-SINGLE filter ensures email-flow batches are not interfered with.

### `zip-processor` Fargate Container

ECS Fargate task in the `ZipPipelineConstruct`, backed by the `zip-processor` ECR image and `archiver` for streaming zip creation.

Steps:
1. Reads `BATCH_ID` from the environment
2. Queries `retrieval_requests` for the batch and attempts to stream every file into the archive
3. For each file, streams `GetObjectCommand` output through the `archiver` zip stream (no full file in memory — pipe directly)
4. Uploads the completed zip to a dedicated `zip-bucket` (separate from the main photo bucket for simpler lifecycle management)
5. Generates a 7-day presigned GET URL for the zip
6. Writes the URL back to `retrieval_batches` and sets `expiresAt` on both the batch and individual requests
7. Sets batch `status=COMPLETED` (or `PARTIAL_FAILURE` if some files failed to stream)

### User-facing changes

- The `/restore-requests` page auto-polls while any batch is in `IN_PROGRESS` or `ZIPPING` state
- A "Download Zip" button appears for `COMPLETED` batches with the presigned URL; download links are disabled when expired
- Batch-level expiration countdown is shown in the accordion header
- `manage-retrieval` computes an `effectiveStatus` at read time: if `expiresAt` has passed, status is returned as `EXPIRED` (no background job needed)
- The album page shows a single contextual button that cycles through states: "Restore Album" → "Restoring…" → "Download" — no separate "Restore" and "Download Album" buttons

### Flow disambiguation

The two restore-completion Lambdas are cleanly separated by `batchType`:
- `handle-restore-completed` (email flow): only processes requests belonging to **SINGLE** batches. Matches `IN_PROGRESS` requests and marks them `AVAILABLE`.
- `handle-glacier-job-complete` (zip flow): only processes requests belonging to **non-SINGLE** batches (ALBUM/MANUAL). Marks them `READY` and coordinates the Fargate zip task.

This `batchType`-based filter replaced the earlier status-based guard (`PENDING/PARTIAL/AVAILABLE` vs `IN_PROGRESS/ZIPPING/COMPLETED`), which was fragile because both flows transition through `IN_PROGRESS`.

## Alternatives Considered

**1. Email with combined zip link (Lambda only)**
Have `handle-restore-completed` detect when all files in an album batch are restored and generate a zip link instead of individual emails.

Rejected because generating a zip from potentially hundreds of files in a Lambda violates the 15-minute timeout and 10 GB `/tmp` storage constraints. A 200-photo album at 10 MB average = 2 GB of data to stream — feasible in memory with streaming, but risky under Lambda's constraints.

**2. Step Functions orchestration**
Use AWS Step Functions to coordinate the restore-wait-zip pipeline.

Rejected because Step Functions adds significant complexity and cost. The state transitions (PENDING → IN_PROGRESS → ZIPPING → COMPLETED) are simple enough to implement with DB columns and targeted Lambda logic. Step Functions is more appropriate for multi-branch, retry-heavy workflows.

**3. Client-side zip (JSZip in the browser)**
Have the browser fetch all presigned URLs and create a zip client-side using JSZip.

Rejected because:
- Each presigned URL for a Glacier-restored file has a limited TTL. If the user closes the browser mid-download, all progress is lost.
- Large albums (GB range) would exhaust browser memory.
- Requires all files to complete their individual restores before the user can initiate the browser-side download.

**4. Lambda streaming with response chunking**
Stream the zip through Lambda's response using Lambda Response Streaming (supported since 2023).

Considered but rejected because Lambda Response Streaming has a 20 MB response limit in practice for buffered modes, and the architectural complexity of keeping a Lambda alive for the full zip duration approaches the same problems as option 1.

**5. Pre-signed S3 batch operation (S3 Batch Operations)**
Use S3 Batch Operations to copy all restored objects to a "staging" prefix, then zip from there.

Rejected because S3 Batch Operations does not produce a zip — it copies individual objects. A separate zip step would still be needed, and S3 Batch Operations has its own job scheduling latency.

## Reasons

- ECS Fargate removes the Lambda timeout and memory constraints. The container can run for hours if needed.
- Streaming via `archiver` means memory usage is constant regardless of album size (each file is piped, not buffered).
- The single "Download Zip" link is a substantially better UX than 200 individual emails for album downloads.
- The `ZipPipelineConstruct` encapsulates ECS cluster, task definition, IAM roles, and the zip S3 bucket — no impact on other constructs.
- The zip step is isolated from the request/response path, so longer-running archive work does not affect API latency.

## Consequences

- `ZipPipelineConstruct` added in `infrastructure/lib/constructs/zip-pipeline.ts`. Provisions: ECS cluster, Fargate task definition, VPC, security group, and zip S3 bucket. The `zip-processor` ECR repository is imported by name rather than created in the construct.
- `handle-glacier-job-complete` Lambda added: SNS trigger, DB transaction for atomic count + RunTask.
- Migration 0017 adds CHECK constraints for new status values on `retrieval_batches` (`IN_PROGRESS`, `ZIPPING`, `COMPLETED`, `PARTIAL_FAILURE`) and `retrieval_requests` (`IN_PROGRESS`, `READY`, `FAILED`, `EXPIRED`).
- The two restore-completion Lambdas are separated by `batchType` (SINGLE vs non-SINGLE) rather than batch status, cleanly partitioning ownership of the shared DB tables.
- The zip bucket has a 7-day lifecycle rule (matching Glacier restore retention) to automatically expire zip archives.
- If the Fargate task fails (for example container startup failure or streaming error), the batch stays in `ZIPPING` or is marked `FAILED` by the task logic, and there is currently no retry mechanism for the zip step. The user would need to initiate a new restore batch.
- The `request-restore` Lambda now checks for existing active batches before issuing new `RestoreObjectCommand` calls, preventing duplicate restore charges when a user accidentally re-requests a batch that is already in progress.
