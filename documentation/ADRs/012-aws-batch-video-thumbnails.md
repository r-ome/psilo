# ADR-012: AWS Batch (Fargate Spot) for Video Thumbnail and Preview Generation

## Date

2026-03-12

## Status

Accepted

## Context

After adding video upload support, the application needed a way to generate thumbnails and short preview clips for videos. The `process-photo-metadata` Lambda handles image processing via Sharp, but video processing with FFmpeg is fundamentally different:

- FFmpeg is a native binary (~70 MB) that cannot be bundled into a Lambda deployment package (250 MB unzipped limit, no standard FFmpeg Lambda layer for Node.js 22).
- Lambda has a maximum execution timeout of 15 minutes. Long or high-bitrate videos can take several minutes to decode even a single frame, making timeout a real risk.
- Lambda memory is capped at 10 GB but FFmpeg benefits from predictable CPU allocation. Lambda CPU scales with memory but is unpredictable under concurrent invocations.
- Lambda's `/tmp` storage is limited to 512 MB (expandable to 10 GB, but at additional cost). Large video files may exceed this depending on source resolution.

The pipeline produces two artifacts per video:
1. A thumbnail JPEG (extracted at the 1-second mark)
2. A 5-second preview MP4 (640px wide, H.264, CRF 28, no audio)

These artifacts stay in S3 Standard so the photo grid can render a static cover image and a hover-to-play preview without any Glacier restore.

## Decision

Use **AWS Batch with a Fargate Spot compute environment** to run a Dockerized FFmpeg job for each uploaded video.

- The `process-photo-metadata` Lambda (SQS consumer) detects video content types, tags the original, and submits a Batch job via `SubmitJobCommand` with `VIDEO_KEY` as a container override environment variable.
- The Batch job definition references a Docker image stored in ECR (`video-thumbnail-processor`). The container is `node:22-slim` with FFmpeg installed via `apt-get`.
- The container downloads the video from S3 to `/tmp/`, runs two FFmpeg commands, uploads the results, and updates the `photos` table directly via `RDSDataClient.ExecuteStatementCommand` (raw SQL — Drizzle ORM is not used in the Batch container to avoid bundling the full `services/` dependency tree).
- The compute environment uses **Fargate Spot** for ~70% cost savings over on-demand. Spot interruptions are acceptable because the job can be resubmitted (video is still in S3).
- Max vCPUs: 256. Each job: 2 vCPU, 4 GB memory.

The Docker image is built and pushed to ECR by the CI/CD pipeline (GitHub Actions) on every push to `main`. CDK passes an `imageTag` context variable pinned to the commit SHA so each deploy uses the exact image that was tested.

## Alternatives Considered

**1. Lambda with a custom FFmpeg layer**
Bundle FFmpeg as a Lambda layer or use a community layer (e.g., `serverless-ffmpeg`).

Rejected because:
- Lambda layers for FFmpeg are not officially maintained for Node.js 22 / Amazon Linux 2023.
- The combined size (Lambda code + FFmpeg layer) approaches the 250 MB unzipped limit.
- 15-minute timeout is still a concern for long videos.
- Difficult to test locally without matching the Lambda execution environment.

**2. Lambda with EFS mount for FFmpeg binary**
Mount an EFS filesystem containing the FFmpeg binary on the Lambda function.

Rejected because EFS requires the Lambda to be inside a VPC (adding NAT gateway cost or VPC endpoints) and introduces EFS provisioning complexity for what is a one-binary problem.

**3. EC2 Auto Scaling group**
Launch spot EC2 instances when a video arrives in a queue, process the video, terminate the instance.

Rejected as severely over-engineered for a personal project. Cold start latency (minutes) and instance management complexity are not justified.

**4. MediaConvert**
Use AWS Elemental MediaConvert for video transcoding.

Rejected because MediaConvert does not produce arbitrary thumbnail images at a specific timestamp in a lightweight, programmatic way, and its pricing (per minute of output) is higher for the 5-second preview use case. It also adds another service dependency with its own IAM and job lifecycle complexity.

**5. Server-Side Rendering via Next.js API route**
Process videos server-side on a long-running Next.js route with FFmpeg.

Rejected — Next.js is deployed serverlessly (Vercel / Lambda-backed). No persistent process; 10-second API route timeout.

## Reasons

- Fargate removes all infrastructure management (no EC2 AMI patching, no cluster sizing).
- The Docker model makes it trivial to install FFmpeg (`apt-get install -y ffmpeg`) and test locally.
- Spot pricing reduces Batch compute cost by ~70% vs. on-demand Fargate.
- Decoupled from the Lambda processing pipeline: video jobs queue independently without affecting image processing throughput.
- The `process-photo-metadata` Lambda exits immediately after submitting the Batch job — no blocking wait, no timeout risk on the Lambda side.

## Consequences

- A `VideoPipelineConstruct` manages the ECR repository, Batch compute environment, job queue, and job definition.
- A second VPC (public subnets, no NAT gateway) is required for Fargate Batch tasks to pull ECR images. This is separate from the isolated VPC used for Aurora.
- ECR image tag is pinned to a git commit SHA via CDK context (`imageTag`). If the image is not pushed before CDK deploy references it, the job definition update fails. The CI/CD pipeline builds and pushes the image before running `cdk deploy`.
- `previewKey` column added to the `photos` table (migration 0013).
- The `manage-photos` Lambda returns `previewUrl` alongside `thumbnailUrl` for video photos. The frontend `PhotoGrid` renders a static thumbnail cover with a hover-activated `<video>` element for preview.
- Batch job failures are silent from the Lambda's perspective (fire-and-forget). The video record stays in `status=pending` until the Batch job updates it. If the job fails permanently, the photo shows as pending indefinitely — there is currently no DLQ equivalent for Batch jobs.
