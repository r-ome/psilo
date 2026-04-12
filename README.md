# PSILO

- [Summary](#summary)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [AWS Architecture](#aws-architecture)
- [Status](#status)
- [Roadmap](#roadmap)
- [Problems Encountered](#problems-encountered)
- [Google Takeout Strategy](#google-takeout-strategy)
- [Key Decisions](#key-decisions)

# Summary

P*ersonal* Silo. A personal cloud storage built with AWS, NextJS, Typescript. Designed as a self-hosted alternative to commercial storage solutions. Optimized for cost using S3 Glacier Flexible Retrieval for cold storage.

Built as a learning project to explore AWS architecture, CDK infrastructure-as-code,
and full-stack TypeScript. Integrated with Claude Code for AI-assisted development.

# Getting Started

## Prerequisites

- Node.js v22+
- AWS CLI configured with appropriate credentials
- AWS CDK v2
- An AWS account

## AWS Service (Auto-provisioned via CDK)

- Provisioned automatically via AWS CDK. See `infrastructure/` for the full stack definition.
  - Core services include:
    - Cognito - authentication
    - API Gateway + Lambda - request handling and business logic
    - S3 - object storage with lifecycle rules (originals transition to Glacier)
    - CloudFront - CDN for thumbnail/preview delivery with signed URLs (24h TTL)
    - SQS + DLQ - for async metadata processing and thumbnail generation
    - EventBridge - listens for S3 storage class transitions and Glacier restore completions
    - Aurora Serverless v2 - stores users, photo metadata, storage class state, retrieval batches
    - AWS Batch (Fargate Spot) + ECR - video thumbnail and preview generation via FFmpeg
    - ECS Fargate + ECR - batch Glacier zip download pipeline
    - SES - email notifications when Glacier restores complete (single-file flow)

# Project Structure

```
├── frontend/                        # Next.js app
├── infrastructure/                  # AWS CDK stacks
│     └── lib/constructs/            # CDK constructs (storage, database, auth, upload-pipeline,
│                                    #   video-pipeline, cdn, zip-pipeline, api)
└── services/                        # Lambda functions + shared code
      ├── generate-presigned-url/    # pHash duplicate check + presigned PUT URL
      ├── manage-photos/             # List, delete, trash, profile/plan endpoints (CloudFront signed URLs)
      ├── manage-albums/             # CRUD albums + album-photo associations (CloudFront signed URLs)
      ├── manage-retrieval/          # List retrieval batches and per-file restore status
      ├── request-restore/           # POST /files/restore — presigned URL or Glacier restore
      ├── handle-restore-completed/  # EventBridge — SES email when Glacier restore finishes (email flow)
      ├── handle-glacier-job-complete/ # SNS — coordinates zip pipeline when all files are restored
      ├── user-provisioning/         # Post-Cognito confirmation setup
      ├── process-photo-metadata/    # EXIF + thumbnail + preview + pHash; submits Batch jobs (videos)
      ├── lifecycle-transition/      # Tracks S3 Glacier transitions (EventBridge)
      ├── handle-upload-dlq/         # Dead-letter queue handler
      ├── purge-deleted-photos/      # Daily cron — hard-deletes soft-deleted photos past retention
      ├── batch/
      │     ├── video-thumbnail-processor/  # Fargate job: FFmpeg thumbnail + 5s preview generation
      │     └── zip-processor/             # Fargate job: stream restored files → zip → S3
      ├── shared/                    # Schema + DB client + CloudFront signer + pHash (bundled by esbuild)
      └── migrations/                # Drizzle SQL migrations (0000–0019)
```

### Frontend

The user-facing application built with Next.js and Typescript. Handles all UI routing and client-side logic. Communicates with backend services via API Gateway through the BFF pattern.

### Infrastructure

AWS CDK project that provisions and manages all cloud resources. Running the CDK deploy will automatically set up all required AWS services. See `infrastructure/` for stack definitions.

### Services

Lambda functions written in TypeScript, each handling a specific domain. Deployed automatically as part of the infrastructure stack. Shared code lives in `services/shared/` and is bundled by esbuild at deploy time.

# Tech Stack

| Layer          | Technology                            |
| -------------- | ------------------------------------- |
| Frontend       | Next.js, TypeScript                   |
| Backend        | AWS Lambda, Node.js v22+              |
| Database       | Aurora Serverless v2 (Drizzle ORM)    |
| Infrastructure | AWS CDK (construct-per-domain)        |
| Storage        | S3 Glacier Flexible Retrieval         |
| CDN            | CloudFront (signed URLs, edge cache)  |
| Auth           | Cognito                               |
| Queue          | SQS + DLQ                             |
| Video          | AWS Batch (Fargate Spot) + FFmpeg     |
| Zip Download   | ECS Fargate + archiver                |
| Email          | SES                                   |
| Registry       | ECR                                   |

# AWS Architecture

```mermaid
graph TD
User["User (Browser)"]
FE["Frontend<br>Next.js"]
APIGW["API Gateway"]
Cognito["Cognito<br>Auth"]
CF["CloudFront<br>CDN (signed URLs)"]
APILambda["API Lambdas<br>(manage-photos, manage-albums,<br>manage-retrieval)"]
PresignLambda["generate-presigned-url<br>(pHash duplicate check)"]
RestoreLambda["request-restore"]
HandleRestoreLambda["handle-restore-completed<br>(email flow)"]
GlacierJobLambda["handle-glacier-job-complete<br>(zip flow coordinator)"]
ProcessLambda["process-photo-metadata<br>(EXIF + thumbnail + pHash)"]
LifecycleLambda["lifecycle-transition"]
DLQLambda["handle-upload-dlq"]
SQS["SQS Upload Queue"]
DLQ["Dead-Letter Queue"]
S3["S3<br>(Standard + Glacier)"]
ZipBucket["S3 Zip Bucket"]
Aurora["Aurora Serverless<br>Metadata + Retrieval Batches"]
EventBridge["EventBridge<br>S3 Events"]
SNS["SNS<br>Restore Completed"]
Batch["AWS Batch<br>(Fargate Spot + FFmpeg)"]
ZipTask["ECS Fargate<br>zip-processor"]
ECR["ECR<br>(video-processor + zip-processor)"]
SES["SES<br>Email"]

User --> FE
FE --> Cognito
FE --> APIGW
APIGW --> APILambda
APIGW --> PresignLambda
APIGW --> RestoreLambda
PresignLambda --> Aurora
PresignLambda --> S3
APILambda --> CF
APILambda --> Aurora
CF --> S3
RestoreLambda --> S3
RestoreLambda --> Aurora
S3 -->|ObjectCreated| SQS
SQS --> ProcessLambda
ProcessLambda --> S3
ProcessLambda --> Aurora
ProcessLambda -->|videos| Batch
ECR --> Batch
ECR --> ZipTask
Batch --> S3
Batch --> Aurora
SQS -->|after 3 retries| DLQ
DLQ --> DLQLambda
S3 -->|StorageClassChanged| EventBridge
S3 -->|RestoreCompleted email flow| EventBridge
S3 -->|RestoreCompleted zip flow| SNS
EventBridge --> LifecycleLambda
EventBridge --> HandleRestoreLambda
SNS --> GlacierJobLambda
LifecycleLambda --> Aurora
HandleRestoreLambda --> Aurora
HandleRestoreLambda --> SES
GlacierJobLambda --> Aurora
GlacierJobLambda -->|all files ready| ZipTask
ZipTask --> S3
ZipTask --> ZipBucket
ZipTask --> Aurora
SES --> User
```

# Status

Currently in active development

- [x] Infrastructure Setup
- [x] Authentication (Cognito)
- [x] File Upload
- [x] File Retrieval
- [x] Album Management (CRUD, rename)
- [x] Thumbnail generation (JPEG/GIF/WebP format-preserving, 800×800, served from Standard)
- [x] S3 Glacier lifecycle for originals (cost optimization)
- [x] Storage usage dashboard with per-class cost breakdown + retrieval cost estimates
- [x] Infinite scroll on dashboard and album detail
- [x] Bulk photo delete
- [x] Trash bin + photo restore
- [x] Video support (upload + thumbnail cover + hover preview via AWS Batch + FFmpeg)
- [x] Full-resolution photo viewer (STANDARD: full-res; GLACIER: preview or thumbnail fallback)
- [x] Full-resolution photo download (Standard: immediate presigned URL; Glacier: restore + SES email)
- [x] Batch Glacier album download (zip pipeline via ECS Fargate)
- [x] Glacier restore tier selection (Expedited / Standard / Bulk)
- [x] Retrieval batch tracking + restore requests page with Download Zip button
- [x] CloudFront CDN for thumbnail/preview delivery (24h edge caching)
- [x] pHash perceptual duplicate detection at upload time
- [x] Tier-aware storage limits, nudges, and settings page
- [x] CDK stack refactored into per-domain constructs

# Roadmap

- [ ] Add Redis or another caching layer for hot reads and duplicate-check-adjacent lookups
- [ ] Add a notifications feature for upload completion / processing completion
- [ ] Simplify restore requests to an Expedited-only path for now and remove Standard/Bulk from the user flow
- [ ] Audit storage and billing calculations against actual write paths, transitions, and retrieval flows
- [ ] Add photo sorting and filtering
- [ ] Document operational edge cases and recovery steps as they are discovered

# Problems Encountered

- Google Photos / Google Takeout exports are often split across multiple zip files, and albums or years can be mixed between archives. Treating the whole export as one giant import is error-prone.
- Aurora Data API payload limits make large DB-backed hash scans fragile. For duplicate checking, broad result sets are unsafe; treat roughly `1 MB` responses as a practical ceiling and keep queries narrow.
- Metadata processing can fail on individual files, so the retry path matters. The app already exposes `POST /api/photos/retry-failed` for re-queueing failed items.
- Batch duplicate handling is intentionally narrower than single-file upload checks. Batch preflight is currently for path-based existing duplicates plus same-batch local duplicate heuristics, not a full DB-wide pHash pass for every file in the batch.

# Google Takeout Strategy

- Import Google Takeout in smaller slices, ideally per year or per explicit request, not as one full-account migration.
- Always import from an extracted folder so media files and JSON sidecars stay together.
- Keep each import bounded enough that duplicate review, retry handling, and sidecar matching remain manageable.
- Use the existing `google-takeout/{importId}/...` pathing so each import run is isolated, while `normalized_import_path` still lets the backend detect re-imports across different export runs.
- Expect some media files to arrive without matching sidecars and some JSON files to remain unmatched; review those counts after every import batch before continuing to the next year/request.

# Key Decisions

- **NextJS** - frontend tech stack. [ADR-001](documentation/ADRs/001-use-nextjs.md)
- **Monorepo** - repository architecture. [ADR-002](documentation/ADRs/002-implement-monorepo.md)
- **AWS** - cloud service provider. [ADR-003](documentation/ADRs/003-leverage-aws-background.md)
- **AWS S3 Glacier Flexible** - cost optimization for cold storage. [ADR-004](documentation/ADRs/004-using-S3-glacier-flexible.md)
- **AWS Aurora Serverless v2** - database. [ADR-005](documentation/ADRs/005-using-aurora-serverless.md)
- **Drizzle** - database ORM. [ADR-006](documentation/ADRs/006-using-drizzle.md)
- **Backend for Frontends (BFF) Pattern** - design pattern for the App. [ADR-007](documentation/ADRs/007-using-bff-approach.md)
- **SQS for async photo metadata processing** - decoupled background processing with DLQ. [ADR-008](documentation/ADRs/008-sqs-async-photo-processing.md)
- **Aurora Data API (no VPC)** - Lambda-to-database connectivity without NAT gateways. [ADR-009](documentation/ADRs/009-aurora-data-api-no-vpc.md)
- **Thumbnail generation pipeline** - fast grid loading while keeping originals in Glacier. [ADR-010](documentation/ADRs/010-thumbnail-generation-pipeline.md)
- **EventBridge for storage class tracking** - sync Glacier transition state to DB without polling. [ADR-011](documentation/ADRs/011-eventbridge-storage-class-tracking.md)
- **AWS Batch (Fargate Spot) for video thumbnails** - FFmpeg video processing outside Lambda constraints. [ADR-012](documentation/ADRs/012-aws-batch-video-thumbnails.md)
- **CloudFront signed URLs** - edge-cached thumbnail/preview delivery with access control. [ADR-013](documentation/ADRs/013-cloudfront-signed-urls.md)
- **pHash duplicate detection** - perceptual hashing to catch near-duplicate uploads before storage. [ADR-014](documentation/ADRs/014-phash-duplicate-detection.md)
- **ECS Fargate zip pipeline for batch Glacier downloads** - single zip download for album restores. [ADR-015](documentation/ADRs/015-batch-glacier-zip-download.md)
