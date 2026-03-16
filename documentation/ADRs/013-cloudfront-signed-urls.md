# ADR-013: CloudFront Signed URLs for Thumbnail and Photo Delivery

## Date

2026-03-14

## Status

Accepted

## Context

The initial implementation served thumbnails and previews directly via S3 presigned GET URLs. Each call to `GET /photos` or `GET /albums/{id}` generated a fresh presigned URL per photo by calling `getSignedUrl()` from `@aws-sdk/s3-request-presigner`.

While `getSignedUrl` is a local cryptographic operation (no S3 API call), it does not enable caching. Every time a user navigates to the dashboard or an album:

- The Lambda generates new signed URLs for every photo in the page.
- The browser fetches each thumbnail directly from S3 — no CDN caching, no edge PoP, full cross-ocean latency from `ap-southeast-1` for non-Singapore users.
- S3 counts a GET request per thumbnail per page view. At 50 thumbnails per page, a user refreshing the dashboard 10 times generates 500 S3 GET requests for thumbnails they've already loaded.

S3 GET pricing: $0.0004 per 1,000 requests. At personal-project scale this is negligible in absolute dollars, but the latency impact — hundreds of milliseconds for uncached thumbnails from distant regions — degrades the user experience.

S3 presigned URLs also do not support `Cache-Control` headers that the browser can respect, because the URL signature changes on every generation, making the URL itself uncacheable (the browser treats each unique URL as a new resource).

## Decision

Add a **CloudFront distribution** in front of the S3 bucket. Replace S3 presigned URLs for thumbnails, previews, and full-resolution STANDARD photos with **CloudFront signed URLs**.

Key implementation details:

- **Origin Access Control (OAC)** authenticates CloudFront's requests to S3. The bucket policy allows only the CloudFront OAC principal — direct S3 access remains blocked.
- **KeyGroup + public key**: a CloudFront key pair is provisioned. The private key is stored in Secrets Manager. Lambdas fetch the private key once per container lifetime (cached in memory between invocations) via `getPrivateKey()` in `services/shared/cloudfront.ts`.
- **Signed URL generation** uses `@aws-sdk/cloudfront-signer`. Path segments are `encodeURIComponent`-encoded before constructing the URL to handle filenames with spaces or special characters.
- **Cache behaviors** (shortest-TTL wins per path):
  - `users/*/thumbnails/*`: 24h default TTL, 7d max TTL
  - `users/*/previews/*`: 1h default TTL, 24h max TTL
  - Default (`users/*/photos/*`, `users/*/videos/*`): 1h default TTL, 24h max TTL
- **`USE_CLOUDFRONT` env var** (Lambda): feature flag for instant rollback to S3 presigned URLs via the AWS console, without redeploying. When `false` or absent, the Lambda falls back to the previous S3 presigned URL path.
- CDK construct: `CdnConstruct` in `infrastructure/lib/constructs/cdn.ts`.

## Alternatives Considered

**1. S3 presigned URLs with long TTL**
Generate presigned URLs with 24-hour expiry instead of 1-hour, and cache them in the DB.

Rejected because:
- Storing presigned URLs in the DB adds complexity (invalidation, rotation, expiry tracking).
- Long-lived presigned URLs are a security concern — revocation requires changing the IAM key or waiting for expiry.
- Does not reduce S3 GET request counts (no CDN caching).
- Does not reduce latency for users outside `ap-southeast-1`.

**2. CloudFront with public S3 bucket (no signed URLs)**
Make the thumbnails path publicly accessible via CloudFront without signed URL authentication.

Rejected because thumbnails reveal private user content. Even though thumbnails are resized and compressed, they are still personal photos that should not be publicly accessible without authentication.

**3. CloudFront with Lambda@Edge for per-request auth**
Validate the JWT token in a Lambda@Edge function and serve the S3 object if valid.

Rejected because Lambda@Edge adds ~10–50ms per request latency (cold start at edge), requires deploying Lambda to `us-east-1` (CloudFront's required region), and is significantly more complex to develop and test than a signed URL approach.

**4. CloudFront without caching (pass-through proxy)**
Add CloudFront purely as a geographic distribution layer without leveraging the cache.

Rejected because it adds cost (CloudFront data transfer) without the primary benefit (cache hit ratio → reduced S3 requests and latency).

**5. Image CDN service (Cloudinary, imgix, Bunny.net)**
Use a third-party image CDN with built-in transformation and delivery.

Rejected because it introduces a third-party dependency, adds cost, and does not align with the project's goal of full AWS self-hosting. The thumbnail pipeline already handles resizing server-side.

## Reasons

- Thumbnails are the same content for the same user across multiple sessions. Cache hit rate after the first load approaches 100% for recent photos.
- CloudFront edge PoPs serve cached responses in <10ms from major cities worldwide — orders of magnitude faster than the S3 origin in Singapore for non-local users.
- S3 GET requests drop to near-zero for cached thumbnails (only cache misses reach the origin).
- Signed URLs maintain access control: only CloudFront can reach S3 (OAC), and only authorized users can generate valid signed URLs (private key in Secrets Manager).
- The `USE_CLOUDFRONT` feature flag provides a safe deployment: CDN can be enabled/disabled without code changes.
- `getSignedUrl` from `@aws-sdk/cloudfront-signer` is a local operation (no AWS API call) — same performance profile as the previous S3 presigner.

## Consequences

- `CdnConstruct` provisions the CloudFront distribution, OAC, and KeyGroup. The public key must be manually uploaded to CloudFront and its ID stored in CDK config / `.env.local` before deploy.
- Three new Lambda env vars: `CLOUDFRONT_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_PRIVATE_KEY_SECRET_ARN`.
- The private key is fetched from Secrets Manager on cold start and cached in Lambda memory. Rotation requires a Lambda restart (or a `USE_CLOUDFRONT=false` toggle) to pick up the new key.
- CloudFront distribution domain must be added to `next.config.ts` `remotePatterns` for Next.js `<Image>` to accept it.
- `*.cloudfront.net` is now an allowed remote pattern in `next.config.ts`.
- For GLACIER photos, the `signedUrl` (full-res) cannot be served because the S3 object is archived and the CloudFront cache would serve a 403. The Lambda falls back to `thumbnailUrl` (thumbnail remains in Standard) for GLACIER photos.
- Cache invalidation is not implemented. If a photo is deleted, its CloudFront-cached thumbnail may be served for up to the TTL period. Acceptable for a personal project; a production system would need explicit `CreateInvalidation` calls on deletion.
