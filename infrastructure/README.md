# Psilo Infrastructure

AWS CDK app for provisioning the Psilo backend stack: storage, auth, database, CDN, async media pipelines, and the HTTP API.

## Commands

```bash
npm run build
npm run test
npm run synth
npm run diff
npx cdk deploy psilo-dev-apse1-stack --require-approval never
```

## Required Environment

Create `infrastructure/.env.local` or `infrastructure/.env` with:

```bash
CDK_DEFAULT_ACCOUNT=<aws account id>
CDK_DEFAULT_REGION=<aws region>
CLOUDFRONT_PUBLIC_KEY_PEM=<public key contents>
CLOUDFRONT_PRIVATE_KEY_SECRET_ARN=<secret arn holding the private key>
IS_PRODUCTION=false
```

You can validate this with:

```bash
npm run check-env
```

## Stack Layout

The stack is composed from domain-focused constructs:

- `StorageConstruct`: private versioned S3 bucket, EventBridge notifications, lifecycle rule that moves `media-type=original` objects to Glacier immediately.
- `DatabaseConstruct`: Aurora Serverless v2 PostgreSQL with Data API enabled.
- `AuthConstruct`: Cognito user pool, client, and post-confirmation `user-provisioning` Lambda.
- `CdnConstruct`: CloudFront distribution, OAC, CloudFront public key, and key group for signed delivery.
- `UploadPipelineConstruct`: S3 `ObjectCreated` -> SQS -> `process-photo-metadata`, plus upload DLQ handling.
- `VideoPipelineConstruct`: AWS Batch on Fargate Spot for video thumbnails and previews.
- `ZipPipelineConstruct`: ECS Fargate zip pipeline plus dedicated zip bucket for restore batches.
- `ApiConstruct`: API Gateway routes plus the app's API Lambdas and restore-completion handlers.

## API Surface

The HTTP API currently exposes:

- `POST /files/presign`
- `POST /files/preflight`
- `POST /files/restore`
- `GET|DELETE|PATCH /photos`
- `POST /photos/retry-failed`
- `GET /photos/storage-size`
- `GET|DELETE /photos/trash`
- `POST /photos/trash/restore`
- `DELETE|PATCH /photos/{key+}`
- `GET|PATCH /user/profile`
- `GET|POST /albums`
- `GET|DELETE|PUT /albums/{albumId}`
- `POST /albums/{albumId}/photos`
- `DELETE /albums/{albumId}/photos/{photoId}`
- `GET /retrieval/batches`
- `GET /retrieval/batches/{batchId}`

All routes are protected by the Cognito JWT authorizer.

## Outputs

The stack emits:

- `CloudFrontDomain`
- `HttpApiUrl`
- `UserPoolId`
- `UserPoolClientId`
- `BucketName`
- `DbClusterArn`
- `DbSecretArn`

## Notes

- CDK does not run Drizzle migrations. Apply SQL migrations from `services/migrations/` separately.
- The `video-thumbnail-processor` ECR repository is created by CDK.
- The `zip-processor` ECR repository is imported by name and must already exist before the first deploy.
