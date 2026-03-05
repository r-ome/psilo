# ADR-004: S3 Glacier Flexible Retrieval as Storage Class

## Date

2026-03-05

## Status

Accepted

## Context

Photos uploaded to this application are stored in S3. S3 offers multiple storage classes with different cost profiles, availability guarantees, and retrieval latencies. The choice of storage class is a significant cost driver for a personal storage application — storage costs accumulate indefinitely as more photos are added.

The primary access pattern for this application is **write-heavy, read-rare**: photos are uploaded regularly, but retrieving them for viewing is infrequent (browsing the archive, downloading specific photos). Real-time millisecond access is not required.

The cost comparison (approximate, ap-southeast-1):
| Storage Class | Storage cost/GB/mo | Retrieval |
|---|---|---|
| S3 Standard | ~$0.025 | Immediate, free |
| S3 Standard-IA | ~$0.0138 | Immediate, per-GB fee |
| S3 Glacier Instant | ~$0.005 | Milliseconds |
| S3 Glacier Flexible | ~$0.0045 | 1–5 min (Expedited), 3–5 hrs (Standard), 5–12 hrs (Bulk, free) |

## Decision

Use S3 Glacier Flexible Retrieval as the storage class for all uploaded photos. If access patterns change significantly (frequent browsing), revisit in favour of S3 Glacier Instant Retrieval.

## Alternatives Considered

**1. S3 Standard**
Immediate retrieval, highest durability, simplest integration — no additional API calls needed to restore objects before serving them.

Rejected because storage costs are ~5.5x higher than Glacier Flexible. For a personal archive that accumulates data over time, this difference compounds significantly.

**2. S3 Standard-IA (Infrequent Access)**
Lower storage cost than Standard, with a per-retrieval fee and a 30-day minimum storage charge per object. Designed for infrequent access with a need for immediate availability.

Considered as a middle ground. Rejected because retrieval is still immediate and charged per GB — not necessary for a use case that accepts delays. Glacier Flexible is cheaper for the same access pattern.

**3. S3 Glacier Instant Retrieval**
Millisecond retrieval with ~$0.005/GB/month storage cost. A strong candidate for infrequent access with occasional on-demand viewing.

Not chosen because immediate retrieval is not required for this personal use case. Waiting 1–5 minutes (Expedited) or using free Bulk retrieval (5–12 hours) is entirely acceptable. Glacier Flexible is ~10% cheaper on storage for the same durability.

**4. S3 Intelligent-Tiering**
Automatically moves objects between access tiers based on usage patterns. Eliminates the need to predict access frequency.

Rejected because it has a per-object monitoring fee (~$0.0025 per 1,000 objects/month). For a large photo library with thousands of objects, this monitoring overhead adds up. Access patterns for a personal archive are predictable enough to not need automatic tiering.

## Reasons

- Glacier Flexible offers the lowest storage cost among the candidates at the known access frequency.
- Personal use means retrieval delays are acceptable. Expedited retrieval (1–5 min) is sufficient for on-demand viewing; free Bulk retrieval (5–12 hrs) covers bulk exports.
- Long-term cost savings are significant as the photo library grows — the lower per-GB rate applies to every GB stored indefinitely.

## Consequences

- Objects in Glacier Flexible cannot be served directly via a presigned URL without first initiating a restore request and waiting for the restore to complete. The application must handle restore initiation, polling restore status, and serving restored copies. This adds complexity to the photo retrieval flow compared to S3 Standard.
- PUT request fees are ~6x higher than S3 Standard. Every upload incurs this premium, but given typical upload volumes for a personal archive, this is negligible in absolute terms.
- There is a minimum storage duration of 90 days per object. Deleting an object before 90 days still incurs the full 90-day storage charge.
- Early deletion fees apply if objects are removed before the 90-day minimum (priced at the remaining days of the 90-day period).
