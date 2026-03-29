# Feature Roadmap — Tier System & Storage Enforcement

> Date: March 29, 2026
> Context: Next implementation phase after pricing analysis and On-Demand tier marketing card.

---

## Current State

| Layer | Status |
|-------|--------|
| **Pricing tiers** | Marketing-only (hardcoded in `frontend/app/page.tsx`). No backend concept of "plan" or "tier". |
| **Users table** | Bare minimum: `id`, `email`, `givenName`, `familyName`, `createdAt`. No `plan`, `storageLimitBytes`, or `tier` column. |
| **Upload flow** | `generate-presigned-url` does **zero** quota checks — presigns unconditionally. |
| **Storage page** | Displays costs but has no notion of limits or warnings. |
| **On-Demand tier** | Frontend card only. No metering, billing, or usage-based logic exists. |

---

## Phase 1 — Tier Foundation

**Goal:** Add plan/tier awareness to the system so all downstream features (limits, nudges, pricing) have a foundation.

### Tasks

1. **Schema migration:** Add `plan` (varchar, default `'free'`) and `storage_limit_bytes` (bigint, default `5368709120` = 5 GB) to `users` table
2. **User profile endpoint:** `GET /user/profile` returning `{ plan, storageLimitBytes, email, givenName, familyName }`
3. **Backfill:** One-off migration/script to set existing users to `plan='free'`
4. **User provisioning:** Update `user-provisioning` Lambda to set `plan='free'` on new user creation

### Tier Config (shared constant)

```
TIERS = {
  free:      { limitGB: 5,    label: "Free" },
  basic:     { limitGB: 200,  label: "Basic" },
  standard:  { limitGB: 1000, label: "Standard" },
  premium:   { limitGB: 2000, label: "Premium" },
  on_demand: { limitGB: null, label: "On-Demand" },
}
```

### Prompt for next session

```
Implement Phase 1 of the tier system. Reference docs/feature-roadmap-tiers.md for full context.

1. Add `plan` (varchar(20), NOT NULL, default 'free') and `storage_limit_bytes` (bigint, NOT NULL, default 5368709120) columns to the `users` table in `services/shared/schema.ts`.
2. Create a Drizzle migration for this schema change.
3. Create a `GET /user/profile` API route:
   - New Lambda or add route to an existing Lambda (e.g. manage-photos)
   - Returns: { plan, storageLimitBytes, email, givenName, familyName }
   - JWT auth, scoped to requesting user's sub
4. Add the API Gateway route in CDK stack for the new endpoint.
5. Create a Next.js BFF proxy route at `app/api/user/profile/route.ts`.
6. Create `user.service.ts` in `app/lib/services/` with `getUserProfile()`.
7. Update `user-provisioning` Lambda to set `plan: 'free'` on new user creation.
8. Add shared tier config constant in `services/shared/tiers.ts` and `frontend/app/lib/tiers.ts`.

Run tests after changes. Check CDK stack includes the new route.
```

---

## Phase 2 — Hard Limit Enforcement + Nudge Alerts

**Goal:** Block uploads when users exceed their plan's storage limit. Show nudge banners when approaching the limit.

### Hard Limit

- **Enforcement point:** `generate-presigned-url` Lambda
- After extracting `userId`, query `users.plan` + `users.storage_limit_bytes`, then `SUM(photos.size)` for current usage
- If `currentUsage + fileSize >= storageLimitBytes`, return `403` with `{ status: "quota_exceeded", currentUsageBytes, limitBytes, plan }`
- On-Demand (`limitGB: null`) skips the check
- Frontend: `UploadContext.tsx` / `FileDropZone` catches `quota_exceeded` and shows upgrade modal

### Nudge Alerts

- **Thresholds:** 80% for free/basic/standard, 90% for premium, N/A for on-demand
- **Locations:** Dashboard banner, StorageOverviewCard, post-upload toast
- **Component:** `<StorageNudgeBanner plan={} usage={} limit={} />`
- **Data source:** `GET /user/profile` (plan + limit) + `GET /photos/storage-size` (current usage)

### Nudge Messages (from pricing analysis)

```
Free:     80% (4 GB)    -> "Upgrade to Basic for 200 GB at $2.49/mo"
Basic:    80% (160 GB)  -> "5x your storage for just $5 more/mo"
Standard: 80% (800 GB)  -> "Double your storage for just $6 more/mo"
Premium:  90% (1.8 TB)  -> "Contact us for custom plans"
```

### Prompt for next session

```
Implement Phase 2 of the tier system. Reference docs/feature-roadmap-tiers.md for full context. Phase 1 (user profile endpoint, plan column, tier config) is already deployed.

1. Add hard limit enforcement in `generate-presigned-url/handler.ts`:
   - After userId extraction, query users table for plan + storageLimitBytes
   - Query SUM(photos.size) WHERE userId AND deletedAt IS NULL
   - Client must send `contentLength` in presign request body
   - If over limit, return 403 with { status: "quota_exceeded", currentUsageBytes, limitBytes, plan }
   - Skip check for on_demand plan
2. Frontend upload handling:
   - Update FileDropZone/UploadContext to send file size in presign request
   - Catch quota_exceeded response and show upgrade dialog (not generic error)
3. Create <StorageNudgeBanner> component:
   - Props: plan, usageBytes, limitBytes
   - Thresholds: 80% for free/basic/standard, 90% for premium
   - Render upgrade CTA with tier-specific messaging
4. Add StorageNudgeBanner to dashboard page and storage page
5. Add Free tier card to marketing pricing page
6. Write tests for quota enforcement logic and nudge threshold logic.
```

---

## Phase 3 — Price Breakdown & Plan Overview

**Goal:** Show users their plan cost vs actual AWS usage, and upgrade options.

### PlanOverviewCard (storage page)

- Shows: plan name, price, usage bar (X GB / Y GB), monthly cost breakdown
- For free users: shows upgrade options with pricing
- For paid users: shows savings vs On-Demand
- Needs: user profile data + storage size data + tier pricing constants

### Prompt for next session

```
Implement Phase 3 of the tier system. Reference docs/feature-roadmap-tiers.md for full context. Phase 1-2 (profile endpoint, hard limits, nudges) are deployed.

1. Create PlanOverviewCard component for the storage page:
   - Display current plan name, monthly price, usage bar (X GB / Y GB with percentage)
   - Monthly breakdown: plan cost, Glacier storage cost, thumbnail cost, processing estimate
   - For free users: show upgrade comparison table (Basic/Standard/Premium with prices)
   - For paid users: show "vs On-Demand" savings calculation
   - [Manage Plan] / [Upgrade Now] CTA button
2. Integrate PlanOverviewCard at top of storage page (above StorageOverviewCard)
3. Share tier pricing constants between marketing page and storage page (use frontend/app/lib/tiers.ts)
4. Write tests for cost calculations and tier comparison logic.
```

---

## Phase 4 — On-Demand Tier (Deferred)

**Goal:** Make On-Demand functional with usage-based billing.

### Dependencies (not yet built)

| Component | Complexity |
|-----------|------------|
| Stripe integration (subscriptions + metered billing) | High |
| Usage metering Lambda (monthly GB calculation) | Medium |
| Invoice generation | High |
| 200 GB minimum enforcement (`max(actualGB, 200) * $0.015`) | Low |
| Plan switching flow (fixed <-> on-demand) | Medium |
| Crossover nudges at 400 GB / 800 GB | Low (reuses Phase 2 nudge infra) |

### Current recommendation

Defer until Stripe is integrated. The On-Demand marketing card can stay with a "Coming Soon" badge or waitlist CTA. Usage metering already exists via `GET /photos/storage-size`.

### Prompt for next session

```
Implement Phase 4 On-Demand tier. Reference docs/feature-roadmap-tiers.md for full context. Phases 1-3 are deployed.

1. Integrate Stripe:
   - Add stripe SDK to services dependencies
   - Create stripe-webhook Lambda for subscription events
   - Support both fixed subscriptions (basic/standard/premium) and metered billing (on-demand)
2. On-Demand metering:
   - Scheduled Lambda (daily/weekly) to report usage to Stripe Usage Records
   - Calculate: max(actualGB, 200) * $0.015 per month
3. Plan management:
   - Endpoint to switch plans (validates, updates users.plan + storageLimitBytes)
   - Handle proration for mid-cycle switches
4. Frontend plan management page
5. Add crossover nudges at 400 GB and 800 GB for on-demand users
6. Update marketing page On-Demand card: remove "Coming Soon", add sign-up flow
```

---

## Architecture Decisions

- **`users.plan` + `users.storage_limit_bytes`** is the linchpin — every feature depends on it
- **Enforcement at presign time** (not upload time) — single gateway, no S3 policy complexity
- **`GET /user/profile`** endpoint serves nudges, plan overview, and future settings page
- **Tier config** duplicated in `services/shared/tiers.ts` and `frontend/app/lib/tiers.ts` (not a shared package — matches monorepo pattern)
- **On-Demand deferred** until Stripe integration — fixed tiers + free tier ship first
