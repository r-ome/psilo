# Tier System Status

> Last updated: 2026-04-12
> Scope: current implementation state plus remaining work for paid plans and On-Demand billing.

---

## Current State

| Layer | Status |
|-------|--------|
| **Pricing tiers** | Marketing page includes `Free`, `On-Demand`, `Basic`, `Standard`, and `Premium`. Shared constants live in `services/shared/tiers.ts` and `frontend/app/lib/tiers.ts`. |
| **Users table** | `users` includes `plan` and `storage_limit_bytes` (`services/shared/schema.ts`, migration `0018_add_user_plan.sql`). |
| **User profile API** | `GET /user/profile` and `PATCH /user/profile` are live via `manage-photos` and exposed in API Gateway. |
| **Provisioning** | New users default to `plan='free'` with a 5 GB limit in `services/user-provisioning/src/db.ts`. |
| **Upload flow** | `/files/presign` and `/files/preflight` enforce quota limits before upload in `services/generate-presigned-url/src/handler.ts`. |
| **Storage UX** | Dashboard and storage page show nudges near limits; storage page also shows `PlanOverviewCard`. |
| **Settings** | `/settings` reads the DB-backed profile and allows switching between manageable fixed tiers. |
| **On-Demand tier** | Present in marketing and shared constants, but not billable. `MANAGEABLE_TIERS` intentionally excludes `on_demand`. |

---

## Implemented Work

### Phase 1: Tier Foundation

Completed:

- Added `plan` and `storage_limit_bytes` to `users`
- Added shared tier constants on both backend and frontend
- Added `GET /user/profile`
- Added new-user default provisioning for the free tier

### Phase 2: Hard Limits and Nudges

Completed:

- `generate-presigned-url` loads the user's current plan and used bytes
- Single-upload presign returns `403` with `status: "quota_exceeded"` when a file would exceed the limit
- Batch preflight tracks projected usage across the upload set and flags later files as `quota_exceeded`
- `StorageNudgeBanner` shows at 80% for `free/basic/standard`, 90% for `premium`, and never for `on_demand`

### Phase 3: Plan Overview and Self-Serve Testing UI

Completed:

- `PlanOverviewCard` is rendered on the storage page
- Free users see upgrade options; fixed-tier users see comparison against On-Demand pricing
- `/settings` includes `PlanUpdateDialog`, which updates `users.plan` and `users.storage_limit_bytes`

---

## Remaining Work

### On-Demand Billing

Not implemented:

- Stripe subscriptions or metered billing
- Usage reporting for On-Demand accounts
- Switching real customers into `on_demand`
- Proration, invoicing, or webhook handling

### Commercial Plan Enforcement

Still missing:

- Payment-provider-backed entitlement checks
- Billing state -> plan synchronization
- Any admin workflow beyond directly updating the `users` row

### Product Gaps

Still deferred:

- Dedicated subscription management UX
- Crossover nudges tailored for real On-Demand usage
- Distinguishing testing-only plan switches from production billing flows

---

## Working Assumptions

- Storage enforcement happens at presign/preflight time, not in S3 policy.
- `users.plan` and `users.storage_limit_bytes` remain the source of truth for quota checks.
- Fixed tiers (`free`, `basic`, `standard`, `premium`) are safe to test inside the app today.
- `on_demand` stays non-user-selectable until billing is implemented end to end.
