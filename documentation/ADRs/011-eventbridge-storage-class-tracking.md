# ADR-011: EventBridge for S3 Storage Class Transition Tracking

## Date

2026-03-10

## Status

Accepted

## Context

Photos uploaded to this application are eventually transitioned from S3 Standard to S3 Glacier Flexible Retrieval by an S3 lifecycle rule (tagged objects with `media-type=original`). The transition happens days or weeks after upload, asynchronously managed by AWS — the application has no explicit control over the exact moment it occurs.

The application needs to know the current storage class of each photo for two reasons:

1. **Cost estimation on the Storage page**: calculating costs requires knowing how many bytes are in Standard vs. Glacier, since pricing differs (~5.5x). Without tracking, all photos would be counted as Standard — producing incorrect cost estimates as photos age into Glacier.

2. **Future retrieval flow**: before serving an original photo (not a thumbnail), the application must check whether a Glacier restore is needed. Restore is only required if the photo is in Glacier — an unnecessary restore initiation for a Standard object fails or wastes a request.

The question is: how should the database `storageClass` column be kept in sync with the actual S3 storage class?

## Decision

Enable S3 event notifications via EventBridge for the psilo bucket. Subscribe a `lifecycle-transition` Lambda to the `Object Storage Class Changed` event type. When AWS transitions an object to Glacier (or back), EventBridge delivers an event to the Lambda, which updates the `storageClass` column in the `photos` table to the new value.

The `manage-photos` `/storage-size` route groups storage metrics by `storageClass`, enabling the frontend to show accurate per-class size and per-type (photo/video) counts.

## Alternatives Considered

**1. Poll S3 `HeadObject` on every photo retrieval**
Before serving a photo, call `HeadObject` to read the current `StorageClass` from S3 metadata. No DB column needed.

Rejected because it adds an extra S3 API call on every list request. For a grid of 50 photos, that's 50 `HeadObject` calls — expensive and slow. Also, the Storage page needs aggregate sizes across all photos, which would require `HeadObject` on every object in the library, not just the ones currently displayed.

**2. Scheduled Lambda to scan and reconcile**
A scheduled Lambda (e.g., daily) calls `ListObjectsV2` + `HeadObject` on all objects, compares with the DB, and updates changed storage classes.

Rejected because:
- Expensive at scale: scanning thousands of objects daily has non-trivial API costs.
- Stale between runs: the DB can be up to 24 hours out of date.
- Does not scale gracefully — scan time and cost grow linearly with library size.

**3. Infer from `takenAt` / `createdAt` + lifecycle rule age**
Compute the expected storage class by checking whether the object is old enough to have been transitioned based on the lifecycle rule's day threshold.

Rejected because it is fragile — if the lifecycle rule changes, all computed values become wrong. It also cannot handle objects that were explicitly excluded from the lifecycle rule or that failed transition for any reason.

**4. S3 Event Notifications direct to Lambda (without EventBridge)**
S3 can invoke Lambda directly on `s3:LifecycleTransition` events. Simpler than EventBridge for a single consumer.

Considered, but `s3:LifecycleTransition` is not a supported event type for direct S3-to-Lambda notifications. EventBridge is the only supported path for receiving storage class change events from S3.

## Reasons

- EventBridge delivers the event at the time of transition, keeping the DB in sync without polling.
- The `lifecycle-transition` Lambda is simple (< 30 lines): decode the object key, update one DB row.
- No additional cost per photo beyond the EventBridge event delivery and Lambda invocation — both are effectively free at personal-project scale.
- Enables the Storage page to show accurate cost breakdowns that update automatically as the library ages into Glacier.

## Consequences

- `storageClass` column added to the `photos` table (migration 0008) with `STANDARD` as the default. New uploads start as `STANDARD`; the DB is updated to `GLACIER` only after EventBridge delivers the transition event.
- There is a small window between S3 executing the transition and EventBridge delivering the event (typically seconds to minutes). During this window the DB may show `STANDARD` while S3 has already moved the object. Acceptable for a cost-display use case; not acceptable for a retrieval flow that must not issue unnecessary restore requests — that flow should always re-check S3 state via `HeadObject` at retrieval time.
- The `lifecycle-transition` Lambda is not behind API Gateway and has no JWT authorizer. It receives `EventBridgeEvent` directly; authentication is handled by IAM resource policies on the Lambda.
- EventBridge must be enabled on the S3 bucket (`eventBridgeEnabled: true` in CDK). This is a bucket-level setting; there is no per-prefix filtering at the EventBridge notification level — the Lambda must ignore irrelevant transitions (e.g., thumbnails) using the object key prefix.
