# RDS Integration, Photo Metadata & Album Management

This document summarizes the full implementation added to Psilo, covering what was built, why each decision was made, the problems encountered, and how they were fixed.

---

## Overview

The goal was to move from a pure S3 file-storage app to one with a real database layer — storing user accounts, photo metadata, and albums. The following was added:

- **AWS Aurora Serverless v2** (Data API) as the database
- **Drizzle ORM** for type-safe queries across all Lambdas
- **Photo metadata extraction** via Sharp, triggered on S3 upload
- **`GET /photos`** — lists a user's uploaded photos with presigned image URLs
- **`DELETE /photos/{key+}`** — deletes a photo from S3 and the DB
- **Full album CRUD** — create, list, view, add/remove photos
- **Next.js Image** rendering in the dashboard with Next's built-in optimization

---

## 1. Shared DB Package (`services/shared/`)

### What
Created two shared TypeScript files used by all Lambdas:
- `services/shared/schema.ts` — Drizzle table definitions
- `services/shared/db.ts` — factory function that creates a Drizzle client

### Why
Each Lambda is bundled independently by esbuild. Rather than duplicating schema and DB setup per-service, a shared directory is used. esbuild resolves imports via relative paths (`../../shared/schema`) and bundles them into each Lambda's output.

### Schema (`services/shared/schema.ts`)
Four tables:
- **`users`** — Cognito sub as primary key, email, given/family name
- **`photos`** — metadata per uploaded file (s3Key, size, width, height, format, contentType)
- **`albums`** — user-created albums
- **`album_photos`** — join table linking photos to albums (composite PK)

**Why FK constraints were removed from `photos` and `albums`:**
The `user-provisioning` Lambda inserts a user row post-Cognito-confirmation. However, `process-photo-metadata` can receive an S3 event before the user row exists in edge cases, causing FK violations. Removing the FK on `userId` in `photos` and `albums` prevents this. The `users` table is still maintained for reference.

```typescript
// photos.userId has no FK — avoids insert failures when user row doesn't exist yet
userId: varchar('user_id', { length: 255 }).notNull(),
```

### DB Client (`services/shared/db.ts`)
Uses `drizzle-orm/aws-data-api/pg` — connects to Aurora via the RDS Data API over HTTPS. No VPC attachment is needed for Lambdas.

```typescript
export function createDb() {
  const client = new RDSDataClient({});
  return drizzle(client, {
    database: process.env.DB_NAME!,
    secretArn: process.env.DB_SECRET_ARN!,
    resourceArn: process.env.DB_CLUSTER_ARN!,
    schema,
  });
}
```

### drizzle-orm install location (`services/package.json`)
**Why:** esbuild resolves modules by traversing up from the entry file. `services/shared/db.ts` needs `drizzle-orm`, but the individual service `node_modules` had their own copies causing TypeScript to see two separate module identities — breaking type compatibility (`SQL<unknown>` from one install wasn't assignable to `SQL<unknown>` from another).

**Fix:** Install `drizzle-orm` once at `services/node_modules/` (the shared parent level). Remove it from all individual service `package.json` files and delete their local `node_modules/drizzle-orm`.

---

## 2. Infrastructure Changes (`infrastructure/lib/stack.ts`)

### Aurora Serverless v2
```typescript
const dbCluster = new rds.DatabaseCluster(this, 'PsiloDb', {
  engine: rds.DatabaseClusterEngine.auroraPostgres({ version: VER_16_6 }),
  writer: rds.ClusterInstance.serverlessV2('writer'),
  enableDataApi: true,
  credentials: rds.Credentials.fromSecret(dbSecret),
  defaultDatabaseName: 'psilo',
});
```

**Why Aurora + Data API:** No VPC required for Lambda connectivity — Data API is HTTPS-based. Serverless V2 scales to zero when idle.

**Why a VPC was still added:** Aurora clusters themselves require a VPC even when Lambdas connect via Data API. A minimal VPC with `PRIVATE_ISOLATED` subnets (no NAT gateway) was used to minimize cost.

### New Lambdas

| Lambda | Trigger | Purpose |
|---|---|---|
| `ProcessPhotoMetadataFn` | S3 `OBJECT_CREATED` on `users/` prefix | Extracts metadata with Sharp, inserts into `photos` table |
| `ManagePhotosFn` | API Gateway (`GET /photos`, `DELETE /photos/{key+}`) | Lists photos with signed URLs, deletes from S3 + DB |
| `ManageAlbumsFn` | API Gateway (5 album routes) | Full album CRUD |

### Sharp Bundling
Sharp is a native Node module that must be compiled for the Lambda runtime (Amazon Linux, linux-x64). CDK's default local bundling installs the macOS binary, which fails on Lambda.

**Approaches tried and why they failed:**
1. `npm_config_platform=linux` + `npm_config_arch=x64` env vars — these npm config variables weren't reliably applied when CDK ran npm install
2. `forceDockerBundling: true` — requires Docker at both deploy and test time; broke Jest tests (`spawnSync docker ENOENT`)

**Final fix — `commandHooks.afterBundling`:**
```typescript
bundling: {
  nodeModules: ['sharp'],
  commandHooks: {
    beforeBundling: () => [],
    beforeInstall: () => [],
    afterBundling: (_inputDir, outputDir) => [
      `cd ${outputDir} && rm -rf node_modules/sharp node_modules/@img && npm install --os=linux --cpu=x64 sharp`,
    ],
  },
},
```
This removes the macOS binary installed by `nodeModules: ['sharp']` and reinstalls with `--os=linux --cpu=x64` — the exact flags from Sharp's official Lambda docs. No Docker needed.

### IAM Permissions
```typescript
userBucket.grantRead(managePhotosFn);   // needed to sign presigned GET URLs
userBucket.grantDelete(managePhotosFn); // needed to delete objects
userBucket.grantRead(processPhotoMetadataFn); // needed to download for metadata extraction
dbCluster.grantDataApiAccess(...);      // all DB Lambdas
dbSecret.grantRead(...);                // all DB Lambdas
```

**Why `grantRead` was added to `managePhotosFn`:**
Generating presigned GET URLs requires `s3:GetObject` on the Lambda's execution role. Only `grantDelete` was originally granted, causing "Access Denied" when clients tried to load the presigned URLs.

### New API Routes
```
GET    /photos
DELETE /photos/{key+}
POST   /albums
GET    /albums
GET    /albums/{albumId}
POST   /albums/{albumId}/photos
DELETE /albums/{albumId}/photos/{photoId}
```

---

## 3. Services

### `user-provisioning` (extended)
Added `src/db.ts` with `insertUser()` that writes a row to the `users` table after Cognito confirms the user.

**Why `onConflictDoNothing()`:** The PostConfirmation trigger can fire more than once in retry scenarios. This makes the insert idempotent.

### S3 Prefix Format
User folders follow the format: `users/{givenName}-{familyName}-{userId}/`

**Why the name is in the prefix:** Makes manual S3 bucket browsing human-readable instead of opaque UUIDs.

**Why `id_token` is used for the files/upload BFF route (instead of `access_token`):**
Cognito's `access_token` does not include user attributes like `given_name` and `family_name`. The `id_token` does. The `files/upload` BFF route was switched to use `id_token` so that `generate-presigned-url` Lambda can read these claims and construct the correct S3 key.

**Why userId is extracted via `.slice(-36)`:**
Cognito subs are always 36-character UUIDs. Extracting the last 36 characters of the user segment (`{givenName}-{familyName}-{userId}`) reliably gives the userId regardless of how long the name portion is.

### `process-photo-metadata` (new)
Triggered by S3 `OBJECT_CREATED` events on the `users/` prefix. For each uploaded object:
1. Downloads the file from S3 via `GetObjectCommand`
2. Pipes the buffer through Sharp to extract width, height, format
3. Extracts `userId` as the last 36 chars of the S3 key's user segment
4. Inserts a row into `photos` via Drizzle
5. Uses `onConflictDoNothing()` to handle duplicate events safely

### `manage-photos` (new)

**`GET /photos`:**
- Queries `photos` table filtered by `userId` (the JWT `sub`)
- Generates a presigned S3 GET URL per photo (1-hour expiry) using `@aws-sdk/s3-request-presigner`
- Returns photos with `signedUrl` included

**Why presigned URLs are generated server-side on the Lambda:**
The S3 bucket is private. The frontend cannot access objects directly. Rather than building a separate image-proxy route, the GET endpoint generates a short-lived signed URL per photo. Next.js Image uses the URL directly and caches the optimized result.

**`DELETE /photos/{key+}`:**
- Ownership guard: extracts the last 36 chars of the S3 key's user segment and compares to the JWT `sub` — rejects with 403 if mismatched
- Deletes from S3 (`DeleteObjectCommand`)
- Deletes the DB row

### `manage-albums` (new)
Routes dispatched on `event.routeKey` (a top-level field on the Lambda event, not inside `requestContext`).

**Why `event.routeKey` and not `event.requestContext.routeKey`:**
API Gateway HTTP API places `routeKey` at the top level of the event object. Tests were returning 405 until this was corrected.

Full CRUD: create album, list albums, get album with photos, add photo to album, remove photo from album. All operations verify album ownership via the JWT `sub` before proceeding.

---

## 4. Migrations (`services/migrate.ts`)

**Why a custom migration script instead of `drizzle-kit migrate`:**
`drizzle-kit migrate` failed with `DrizzleQueryError: Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"` due to an internal middleware conflict in the AWS SDK version used by drizzle-kit.

The custom script reads the generated SQL migration file, splits on `-->statement-breakpoint`, and executes each statement directly via `RDSDataClient.ExecuteStatementCommand`. It also drops the FK constraints on `photos` and `albums` that were causing insert failures.

Run once after deploy:
```bash
cd services && npx tsx migrate.ts
```

---

## 5. Frontend

### BFF Proxy Routes
All frontend routes follow the BFF (Backend for Frontend) pattern: read `access_token` from httpOnly cookie, forward to API Gateway with `Authorization: Bearer`.

| File | Methods | Proxies to |
|---|---|---|
| `app/api/photos/route.ts` | GET, DELETE | `GET /photos`, `DELETE /photos/{key+}` |
| `app/api/albums/route.ts` | GET, POST | `/albums` |
| `app/api/albums/[albumId]/route.ts` | GET | `/albums/{albumId}` |
| `app/api/albums/[albumId]/photos/route.ts` | POST | `/albums/{albumId}/photos` |
| `app/api/albums/[albumId]/photos/[photoId]/route.ts` | DELETE | `/albums/{albumId}/photos/{photoId}` |

**Why `delete` was added to `api.ts`:**
The existing client wrapper (`app/lib/api.ts`) only had `get` and `post`. Deleting photos required a `DELETE` HTTP method.

### Photo & Album Services
- `app/lib/services/photo.service.ts` — `listPhotos()`, `deletePhoto(key)`
- `app/lib/services/album.service.ts` — `createAlbum()`, `listAlbums()`, `getAlbum()`, `addPhotoToAlbum()`, `removePhotoFromAlbum()`

### Dashboard (`app/(protected)/dashboard/page.tsx`)
Converted to a `"use client"` component with:
- `loadPhotos` callback (runs on mount and after each successful upload)
- Photo grid using Next.js `<Image>` with `fill` + `object-cover` for consistent aspect-ratio tiles
- Per-photo delete button (hover-revealed)
- `FileDropZone` receives `onUploadComplete={loadPhotos}` to refresh the grid after upload

### Next.js Image Configuration (`next.config.ts`)
```typescript
images: {
  remotePatterns: [{ protocol: 'https', hostname: '**.amazonaws.com' }],
},
```
**Why:** Next.js Image optimization requires allowlisted remote hostnames. Without this, loading presigned S3 URLs throws a configuration error.

### Albums Pages
- `app/(protected)/albums/page.tsx` — list albums, create new album
- `app/(protected)/albums/[albumId]/page.tsx` — view photos in album, remove photos, add existing photos via modal

---

## 6. Deployment Order

```bash
# 1. Deploy infrastructure (Lambdas, Aurora, API routes, IAM)
cd infrastructure && npx cdk deploy psilo-dev-apse1-stack --require-approval never

# 2. Run DB migration (creates tables, drops FK constraints)
cd services && npx tsx migrate.ts

# 3. Clear old S3 data (old prefix format: users/{userId}/)
#    Delete manually via S3 console — existing objects won't match new prefix

# 4. Re-upload photos
#    New uploads land at users/{givenName}-{familyName}-{userId}/{filename}
#    S3 event triggers process-photo-metadata → inserts into photos table
```

---

## 7. Key Debugging Notes

| Problem | Root Cause | Fix |
|---|---|---|
| `sharp` runtime error on Lambda | CDK local bundling installs macOS binary | `commandHooks.afterBundling` reinstalls with `--os=linux --cpu=x64` |
| `Access Denied` on presigned GET URLs | `managePhotosFn` missing `s3:GetObject` IAM permission | Added `userBucket.grantRead(managePhotosFn)` |
| Empty `photos` table after upload | Stack not redeployed; Lambda had no DB env vars | Deploy, then re-upload |
| FK constraint failure on user insert | `photos`/`albums` referenced `users` but user row didn't exist | Removed FK constraints from schema |
| Double-slash URL (`//photos`) | `BACKEND_API_URL` in `.env.local` had trailing slash | Remove trailing `/` from the env var |
| `drizzle-orm` type mismatch in TypeScript | Two separate installs: `service/node_modules` and `services/node_modules` | Install once at `services/` level, remove from individual services |
| `manage-albums` tests always returning 405 | `routeKey` read from `requestContext` instead of top-level event | Fixed test `makeEvent()` and confirmed handler reads `event.routeKey` |
| `drizzle-kit migrate` middleware error | Internal AWS SDK conflict inside drizzle-kit runner | Replaced with custom `migrate.ts` using `RDSDataClient` directly |
