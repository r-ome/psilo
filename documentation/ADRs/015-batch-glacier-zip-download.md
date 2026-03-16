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

Add a **zip pipeline** triggered after all files in an album-level (`batchType=ALBUM`) Glacier batch are fully restored:

### SNS + `handle-glacier-job-complete` Lambda

When S3 completes a Glacier restore, it emits an "Object Restore Completed" event. For **zip-flow batches** (ALBUM type), this event is routed via SNS to a new `handle-glacier-job-complete` Lambda instead of directly triggering `handle-restore-completed`.

The Lambda:
1. Marks the `retrieval_request` for the restored key as `status=READY`
2. Counts remaining `IN_PROGRESS` requests in the batch
3. When the count reaches zero → calls `ecs.RunTask` to launch the zip-processor Fargate container, passing the batch ID and bucket credentials as container environment overrides
4. Updates batch `status=ZIPPING`

The atomic "check count + trigger" step uses a DB transaction to prevent two concurrent SNS deliveries from both triggering the Fargate task.

### `zip-processor` Fargate Container

ECS Fargate Spot task in the `ZipPipelineConstruct`. `node:22-slim` image with `archiver` for streaming zip creation.

Steps:
1. Reads `BATCH_ID` from the environment
2. Queries `retrieval_requests WHERE batchId = BATCH_ID AND status = READY`
3. For each file, streams `GetObjectCommand` output through the `archiver` zip stream (no full file in memory — pipe directly)
4. Uploads the completed zip to a dedicated `zip-bucket` (separate from the main photo bucket for simpler lifecycle management)
5. Generates a presigned GET URL for the zip with a `RESTORE_RETENTION_DAYS`-day expiry
6. Writes the URL back to `retrieval_batches`
7. Sets batch `status=COMPLETED`

### User-facing changes

- The `/restore-requests` page auto-polls while any batch is in `IN_PROGRESS` or `ZIPPING` state
- A "Download Zip" button appears for `COMPLETED` batches with the presigned URL
- The album page shows a single contextual button that cycles through states: "Restore Album" → "Restoring…" → "Download" — no separate "Restore" and "Download Album" buttons

### Flow disambiguation

The `handle-restore-completed` Lambda is guarded to only process batches in `PENDING/PARTIAL/AVAILABLE` states (email flow). Batches in `IN_PROGRESS/ZIPPING/COMPLETED` (zip flow) are skipped to prevent interference.

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

- Fargate Spot removes the Lambda timeout and memory constraints. The container can run for hours if needed.
- Streaming via `archiver` means memory usage is constant regardless of album size (each file is piped, not buffered).
- The single "Download Zip" link is a substantially better UX than 200 individual emails for album downloads.
- The `ZipPipelineConstruct` encapsulates ECS cluster, task definition, IAM roles, and the zip S3 bucket — no impact on other constructs.
- Fargate Spot costs ~70% less than on-demand. A 2-hour zip job at 0.5 vCPU / 1 GB memory costs roughly $0.01–0.02 on Spot.

## Consequences

- `ZipPipelineConstruct` added in `infrastructure/lib/constructs/zip-pipeline.ts`. Provisions: ECS cluster, Fargate task definition, ECR repo (`zip-processor`), zip S3 bucket.
- `handle-glacier-job-complete` Lambda added: SNS trigger, DB transaction for atomic count + RunTask.
- Migration 0017 adds CHECK constraints for new status values on `retrieval_batches` (`IN_PROGRESS`, `ZIPPING`, `COMPLETED`, `PARTIAL_FAILURE`) and `retrieval_requests` (`IN_PROGRESS`, `READY`, `FAILED`, `EXPIRED`).
- The `handle-restore-completed` Lambda must guard its batch status update logic to avoid corrupting zip-flow batch states. This creates a coupling between two Lambdas that share the same DB tables.
- The zip bucket needs its own lifecycle rule to expire zip archives after `RESTORE_RETENTION_DAYS` days, or they accumulate indefinitely.
- If the Fargate task fails (e.g., Spot interruption mid-zip), the batch stays in `ZIPPING` state indefinitely — there is currently no retry mechanism for the zip step. The user would need to initiate a new restore batch.
- The `request-restore` Lambda now checks for existing active batches before issuing new `RestoreObjectCommand` calls, preventing duplicate restore charges when a user accidentally re-requests a batch that is already in progress.
