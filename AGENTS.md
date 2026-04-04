# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

## Commands

### Frontend (`cd frontend`)

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest in watch mode
npm run test:run     # Vitest single run
npm run test:coverage
```

Run a single test file:

```bash
npx vitest run __tests__/unit/api/auth/login/route.test.ts
```

### Infrastructure (`cd infrastructure`)

```bash
npm run build        # tsc compile
npm run test         # Jest
npm run synth        # cdk synth
npm run diff         # cdk diff
npx cdk deploy psilo-dev-apse1-stack --require-approval never
```

- After implementing backend Lambda handlers or API routes, always verify the corresponding API Gateway route configuration in the CDK stack includes the new HTTP method. Check `*stack*` or `*gateway*` files for route definitions.

### Services

Each service has its own `node_modules`.

```bash
cd services/generate-presigned-url && npm install
cd services/user-provisioning && npm install
cd services/manage-photos && npm install
cd services/manage-albums && npm install
cd services/process-photo-metadata && npm install
cd services/lifecycle-transition && npm install
cd services/handle-upload-dlq && npm install
```

Run service tests:

```bash
cd services/generate-presigned-url && npm test
cd services/user-provisioning && npm test
cd services/manage-photos && npm test
cd services/manage-albums && npm test
cd services/process-photo-metadata && npm test
cd services/lifecycle-transition && npm test
cd services/handle-upload-dlq && npm test
```

## Pre-commit Hooks

Husky runs automatically on commit:

- `lint-staged` runs ESLint on staged `frontend/**/*.{ts,tsx}` files
- If `frontend/` files are staged: runs `tsc --noEmit`, `vitest run`, and `next build`
- If `services/generate-presigned-url/` files are staged: runs `npm test` in that service
- If `services/user-provisioning/` files are staged: runs `npm test` in that service
- If `infrastructure/` files are staged: runs `npm test` in infrastructure

Note: the hook currently only auto-runs tests for `generate-presigned-url` and `user-provisioning`. For other services (`manage-photos`, `manage-albums`, `process-photo-metadata`, `lifecycle-transition`, `handle-upload-dlq`), run tests manually before committing.

Fix type errors and failing tests before committing.

## Architecture

### Monorepo Structure

Loose monorepo, no workspace manager. Each package manages its own `node_modules`.

```
frontend/        Next.js 16 (App Router) - user-facing app
infrastructure/  AWS CDK - provisions all AWS resources
services/
  generate-presigned-url/  Lambda - returns S3 presigned PUT URLs
  manage-photos/           Lambda - list, delete (single/bulk), storage stats; route via event.routeKey
  manage-albums/           Lambda - CRUD albums and album-photo associations
  user-provisioning/       Lambda - runs post-Cognito-confirmation to create S3 user folder
  process-photo-metadata/  Lambda - SQS-triggered; extracts EXIF, generates thumbnails, tags originals
  lifecycle-transition/    Lambda - EventBridge-triggered; updates storageClass in DB on S3 Glacier transition
  handle-upload-dlq/       Lambda - handles dead-letter queue for failed upload processing
  shared/                  Shared code (`schema.ts`, `db.ts`) - bundled by esbuild, not a formal package
```

### AWS Infrastructure

All resources are defined in `infrastructure/lib/stack.ts`:

- **S3 bucket** (`psilo-{account}`): user file storage, private. Key layout:
  - `users/{userId}/photos/{filename}` - original photos tagged `media-type=original`
  - `users/{userId}/videos/{filename}` - videos
  - `users/{userId}/thumbnails/{filename}` - generated thumbnails
  - S3 lifecycle rule transitions `media-type=original` objects to Glacier after a configurable period
- **Cognito User Pool**: email-based auth, triggers `user-provisioning` Lambda on post-confirmation
- **API Gateway (HTTP API)**: routes protected by Cognito JWT authorizer:
  - `POST /files/presign` - get presigned upload URL
  - `GET /photos`, `DELETE /photos` - list and delete (single/bulk) photos
  - `GET /photos/storage-size` - storage usage breakdown by class
  - `GET /albums`, `POST /albums`, `PUT /albums/{id}`, `DELETE /albums/{id}` - album CRUD
- **SQS + DLQ**: upload events queue feeding `process-photo-metadata`; failures go to `handle-upload-dlq`
- **EventBridge**: listens for S3 storage class change events and triggers `lifecycle-transition`
- **Lambdas**: bundled via `NodejsFunction` (esbuild), Node.js 22; `sharp` bundled as a native module (`nodeModules: ['sharp']`)

CI/CD in `.github/workflows/infrastructure.yml` deploys on push to `main` when `infrastructure/**` or `services/**` change, using OIDC for AWS credentials.

### Auth Flow

1. Login via `POST /api/auth/login` (Next.js API route) and call Cognito SDK directly
2. Tokens stored as httpOnly cookies: `access_token`, `id_token`, `refresh_token`
3. `AuthContext` tracks `isAuthenticated` state client-side
4. Protected routes check auth via middleware/layout

### File Upload Flow

1. `FileDropZone` supports multiple files. On selection, all presigned URLs are fetched in parallel first (`Promise.all`), then all files are uploaded in parallel, then `onUploadComplete` is called once after all finish.
2. Next.js API route reads `access_token` cookie, then calls API Gateway `POST /files/presign` with `Authorization: Bearer <token>`
3. Lambda validates JWT, scopes S3 key to `users/{sub}/photos/{filename}` or `users/{sub}/videos/{filename}` based on content type, and returns a presigned PUT URL
4. Client uses `XMLHttpRequest` to PUT file directly to S3 with real progress tracking per file
5. S3 event triggers `process-photo-metadata` via SQS: extracts EXIF data, generates 800x800 JPEG thumbnail at `users/{sub}/thumbnails/{filename}`, and tags original with `media-type=original` for Glacier lifecycle

### Frontend Conventions

- **Route groups**: `(auth)` for public auth pages, `(protected)` for authenticated pages
- **API routes** act as a proxy/BFF: they hold secrets, read httpOnly cookies, and forward to the backend
- **`app/lib/api.ts`**: client-side fetch wrapper. Use `api.post()`, `api.get()`, and `api.delete(body?)` for Next.js API routes, not raw `fetch`
- **`app/lib/env.server.ts`**: validated server-side env vars; import only in server components/routes
- **`app/lib/services/`**: service modules that wrap `api.*` calls
- UI components use shadcn/ui (new-york style), added via `npx shadcn add <component>`

### Shared Photo UI Components (`frontend/app/(protected)/components/`)

- **`PhotoGrid`** - reusable grid for photos and videos. Props: `photos`, `selectedIds`, `onToggleSelect`, `onDeleteRequest`, `onPhotoClick`. Shows check icon top-left and trash button top-right on hover; selected items get a `border-primary` ring. Photos display via `thumbnailUrl`; videos render inline `<video>`.
- **`DeleteConfirmDialog`** - `AlertDialog` for single (`photo` prop) or bulk (`bulkCount` prop) delete confirmation. Pass only one at a time.
- **`ImageViewer`** - fullscreen `Dialog` plus Embla `Carousel`. Props: `photos`, `initialIndex` (`null` = closed), `onClose`. Supports arrow key navigation and Escape to close. Uses explicit `width`/`height` props on `Image` and `max-h-[calc(90vh-4rem)]`; do not switch to `fill` because the carousel overflow breaks height propagation. Videos shown via `<video>` in the carousel.
- **`FileDropZone`** - drag-and-drop / click-to-browse uploader with per-file progress bars.

### Dashboard Infinite Scroll

The dashboard uses `IntersectionObserver` on a sentinel `<div>` at the bottom of the grid to trigger loading the next page. A loading indicator is shown below the grid while fetching. The `Load More` button pattern is no longer used.

### Bulk Selection Pattern

1. `selectedIds: Set<string>` plus `setSelectedIds` state in the page
2. `bulkDeletePending` / `bulkRemovePending: boolean` state gates the confirm dialog
3. "Delete selected" button sets pending flag, opens `<DeleteConfirmDialog bulkCount={...}>`, confirm calls `deletePhotos(keys[])` with a bulk `DELETE`, then clears both flag and selection
4. Individual delete also removes the photo from `selectedIds`
5. Bulk delete calls `DELETE /api/photos` with `{ keys: string[] }` body, and the Lambda uses `DeleteObjectsCommand`

### shadcn/ui Components Installed

`alert-dialog`, `button`, `card`, `carousel` (`embla-carousel-react`), `dialog`, `input`, `label`, `navigation-menu`, `sonner`

### Testing Conventions

- Tests live in `frontend/__tests__/unit/`, mirroring the `app/` structure
- Mock `next/headers`, `env.server`, and service modules with `vi.mock()`
- Test API routes by directly calling the exported handler, for example `POST(req)`, with a real `NextRequest`

## Environment Variables

Frontend (`.env.local`):

| Variable | Used in |
| --- | --- |
| `BACKEND_API_URL` | Server-only - API Gateway base URL |
| `COGNITO_USER_POOL_ID` | Server-only |
| `COGNITO_APP_CLIENT_ID` | Server-only |
| `AWS_REGION` | Server-only |
| `NODE_ENV` | Server-only - set automatically by Next.js |

`BACKEND_API_URL` is the `HttpApiUrl` output from CDK deploy.

## Workflow

- Always run `npx tsc --noEmit` after making changes across multiple files to catch missed consumer files and type errors before committing.
- When working in plan mode, do not start implementation until explicitly told. If the user says to implement, switch out of plan mode and write code. Do not end a session with only a plan file when implementation was requested.

## Conventions

- When making API calls in the Next.js frontend, use the project's existing API library (`api.post()`, `api.get()`, etc.), not raw `fetch`.

## Performance

- For bulk changes across many files, prefer `sed` or scripted batch operations instead of editing files one by one to reduce token usage.

## Testing

- This project uses TypeScript with Next.js and AWS CDK. Always run tests, or the equivalent validation, after modifying test files or code with test coverage.
- Be careful with server-only imports such as `import 'server-only'` in utility modules because they can break Jest tests. Keep test-compatible code separate from server-only modules.

## Git Workflow

- After making code changes, inform the user of what changed and ask if they want you to commit.
- Only commit when the user explicitly says `commit`, `create a commit`, or similar.
- For git operations, never commit without explicit permission. When removing files from git tracking, use `git rm --cached` and do not delete files from disk.
- Use conventional commits for commit messages. The repo history consistently uses prefixes like `feat:`, `fix:`, `docs:`, and `chore:` followed by a short imperative summary.
