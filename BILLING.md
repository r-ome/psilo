# AWS Billing Forecast

> Region: ap-southeast-1 (Singapore) | Exchange rate: $1 USD ≈ ₱57.50 PHP

---

## Baseline Monthly Cost (no uploads, idle)

| Service | Config | USD/month | PHP/month |
|---|---|---|---|
| Aurora Serverless v2 | Scales to 0 when idle (min 0 ACU) | ~$0–5.00 | ₱0–288 |
| Aurora Storage | ~1 GB empty DB | ~$0.10 | ₱5.75 |
| Secrets Manager | 1 secret (fixed) | $0.40 | ₱23.00 |
| S3 | No objects | $0.00 | ₱0.00 |
| Lambda (7 functions) | Free tier: 1M req + 400K GB-sec | $0.00 | ₱0.00 |
| SQS (2 queues) | Free tier: 1M req/month | $0.00 | ₱0.00 |
| API Gateway (HTTP API) | Free tier: 1M req/month | $0.00 | ₱0.00 |
| Cognito | Free tier: 10K MAUs/month | $0.00 | ₱0.00 |
| EventBridge | AWS service events are free | $0.00 | ₱0.00 |
| VPC | No NAT gateways | $0.00 | ₱0.00 |

| Scenario | USD | PHP |
|---|---|---|
| **Fully idle** | ~$0.50 | **~₱28.75** |
| **Typical dev use** (~10 hrs Aurora active) | ~$1.10 | **~₱63.25** |
| **Aurora always on at 0.5 ACU** | ~$5.40 | **~₱310.50** |

> **Note:** Originally deployed with `serverlessV2MinCapacity: 0.5`, costing ~$43/month idle.
> Updated to `serverlessV2MinCapacity: 0` — saving ~₱2,415–2,530/month.

---

## Cost After Uploading 393 GB of Photos

**Assumptions:**
- Average photo size: ~5 MB → ~80,000 photos
- Average thumbnail: ~150 KB (800×800 JPEG) → ~12 GB total thumbnails
- Originals transition to **Glacier Flexible Retrieval within 1 day** (lifecycle `days(0)`)
- Lambda processing avg ~3 sec/photo (S3 read + sharp resize + Data API write)

### S3 Storage

| Item | Calc | USD | PHP |
|---|---|---|---|
| Originals in STANDARD (1 day) | 393 GB × $0.025 × 1/30 | $0.33 | ₱18.98 |
| Originals in Glacier (29 days) | 393 GB × $0.0045 × 29/30 | $1.71 | ₱98.33 |
| Glacier per-object overhead (40 KB × 80K = 3.2 GB) | 3.2 GB × $0.0045 | $0.01 | ₱0.58 |
| Thumbnails in STANDARD (full month, ~12 GB) | 12 GB × $0.025 | $0.30 | ₱17.25 |
| **Subtotal** | | **$2.35** | **₱135.13** |

### S3 Requests & Transitions

| Item | Calc | USD | PHP |
|---|---|---|---|
| PUT originals (80K uploads) | 80K × $0.005/1K | $0.40 | ₱23.00 |
| GET originals by Lambda (80K) | 80K × $0.0004/1K | $0.03 | ₱1.73 |
| PUT thumbnails by Lambda (80K) | 80K × $0.005/1K | $0.40 | ₱23.00 |
| PutObjectTagging originals (80K) | 80K × $0.005/1K | $0.40 | ₱23.00 |
| Lifecycle transitions to Glacier (80K objects) | 80K × $0.05/1K | $4.00 | ₱230.00 |
| **Subtotal** | | **$5.23** | **₱300.73** |

### Lambda — `process-photo-metadata` (3008 MB)

| Item | Calc | USD | PHP |
|---|---|---|---|
| Compute | 80K × 3s × 2.94 GB = 705K GB-sec; free tier 400K; billable 305K × $0.00001667 | $5.08 | ₱292.10 |
| Requests (80K invocations) | 80K × $0.20/M | $0.02 | ₱1.15 |
| **Subtotal** | | **$5.10** | **₱293.25** |

### Aurora Serverless v2

| Item | Calc | USD | PHP |
|---|---|---|---|
| Processing burst (~2 hrs at 1 ACU) | 2 × 1 × $0.12 | $0.24 | ₱13.80 |
| Rest of month idle/occasional | ~1 hr/day at 0.5 ACU × 29 days | $0.17 | ₱9.78 |
| **Subtotal** | | **$0.41** | **₱23.58** |

### Other Services

| Service | USD | PHP |
|---|---|---|
| API Gateway (~80K presign calls, near free tier) | $0.08 | ₱4.60 |
| Secrets Manager (1 secret, fixed) | $0.40 | ₱23.00 |
| SQS (~160K msgs incl. thumbnail events, free tier) | $0.00 | ₱0.00 |
| EventBridge (AWS service events, free) | $0.00 | ₱0.00 |
| Lambda — other 6 functions (free tier) | $0.00 | ₱0.00 |
| VPC, Cognito | $0.00 | ₱0.00 |

### Summary

| | USD | PHP |
|---|---|---|
| **Month of upload (one-time + storage)** | **~$13.57** | **~₱780.28** |
| **Every subsequent month (storage only)** | **~$2.97** | **~₱170.78** |

---

## Subsequent Months (Storage Only)

After the upload month, costs flatten significantly:

| What you're paying for | PHP/month |
|---|---|
| Glacier storage (393 GB) | ~₱98 |
| Thumbnails in STANDARD (12 GB) | ~₱17 |
| Aurora idle (minimal use) | ~₱29 |
| Secrets Manager | ~₱23 |
| **Total** | **~₱167–171** |

That's roughly **₱170/month** to store and serve 393 GB of photos.

---

## Why It's Cost-Effective Long-Term

The design choices that keep ongoing costs low:

- **Glacier for originals** — 82% cheaper than S3 Standard ($0.0045 vs $0.025/GB)
- **Thumbnails stay in STANDARD** — fast browsing without Glacier retrieval fees
- **Aurora scales to 0** — no idle compute waste
- **No NAT gateways** — saves ~$65/month compared to a typical 2-AZ setup
- **Serverless everything** — pay only when things actually run

The expensive part is the **one-time ingestion cost** (Lambda processing + Glacier transition fees), not ongoing storage. Good trade-off for a personal photo archive.

---

## Watch Out: Glacier 90-Day Minimum

Glacier Flexible Retrieval has a **90-day minimum storage commitment**. If you delete photos before 90 days, you're still charged for the full 90 days.

Early deletion penalty for 393 GB: `393 GB × $0.0045 × 3 months = $5.31 (₱305)`
