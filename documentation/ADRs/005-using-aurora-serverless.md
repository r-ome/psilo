# ADR-005: Aurora Serverless v2 as the Relational Database

## Date

2026-03-05

## Status

Accepted

## Context

This application requires a relational database to store users, photo metadata (dimensions, EXIF data, S3 keys, processing status), album definitions, and album-photo associations. These entities have clear relationships and benefit from relational integrity constraints (foreign keys, cascading deletes).

The key constraint is cost: this is a personal application with low and irregular traffic. The database should not incur significant costs when the application is idle, which is the majority of the time.

The database connectivity model is also a constraint. Lambda functions need to reach the database. The standard approach is to place Lambdas in the same VPC as the database, but this incurs NAT gateway costs for outbound AWS API calls. Aurora Serverless v2 with the RDS Data API enables database access over HTTPS without requiring Lambdas to be in a VPC — see [ADR-009](009-aurora-data-api-no-vpc.md).

## Decision

Use Aurora Serverless v2 (PostgreSQL-compatible) with the RDS Data API enabled.

## Alternatives Considered

**1. Amazon RDS (PostgreSQL, provisioned)**
Standard provisioned RDS runs 24/7. Even the smallest instance (db.t3.micro) costs ~$15–20/month in ap-southeast-1 regardless of utilisation.

Rejected because idle costs are too high for a personal project. Aurora Serverless scales to zero (0.5 ACU minimum), eliminating costs during periods of no activity.

**2. Amazon DynamoDB**
DynamoDB is serverless, scales to zero on-demand, and has no idle costs. It integrates well with Lambda.

Rejected because the data model is relational — albums contain photos, photos belong to users, album-photo associations have integrity requirements. Modelling this in DynamoDB requires careful key design and loses the natural relational constraints. Given the learning goals of this project and the small scale, a relational database is a better fit.

**3. PlanetScale / Neon / Supabase (managed cloud PostgreSQL)**
Third-party managed PostgreSQL services often have generous free tiers and simple setup. Neon, for example, scales to zero and charges only for compute time.

Rejected because the project is committed to AWS (see [ADR-003](003-leverage-aws-background.md)). Introducing a third-party database breaks the single-provider architecture and adds an external dependency outside the CDK stack.

**4. SQLite (embedded)**
SQLite is zero-cost, zero-config, and sufficient for single-user workloads. It could be bundled with a Lambda or stored on EFS.

Rejected because Lambda's ephemeral filesystem is not suitable for persistent state, and EFS adds complexity and cost. SQLite is also a poor fit for a distributed serverless architecture where multiple Lambda invocations may run concurrently.

**5. Aurora Serverless v1**
The predecessor to v2. v1 could scale to zero entirely but had slow cold-start times (30–60 seconds to resume from zero) and did not support all PostgreSQL features.

Rejected because v2 offers faster scaling, better PostgreSQL compatibility, and the same Data API support. v1 is considered legacy.

## Reasons

- Aurora Serverless v2 scales down to 0.5 ACU when idle and can scale to 0 ACU during extended inactivity (with resume latency), keeping idle costs near zero.
- PostgreSQL compatibility means standard SQL, full relational integrity, and Drizzle ORM support (see [ADR-006](006-using-drizzle.md)).
- The RDS Data API enables Lambda-to-database connectivity over HTTPS without requiring VPC placement, eliminating NAT gateway costs — the largest potential infrastructure cost item. See [ADR-009](009-aurora-data-api-no-vpc.md).
- Credentials are managed via AWS Secrets Manager and referenced in the Data API calls, eliminating hardcoded connection strings.
- Max ACU is capped at 4 in the CDK stack, providing a cost ceiling under unexpected load.

## Consequences

- Aurora Serverless v2 minimum capacity (0.5 ACU) still incurs a small idle cost (~$0.06/hour in ap-southeast-1 when running). Costs are not zero unless the cluster is fully paused.
- The RDS Data API has a 64 KB response size limit per query. Queries returning large result sets must be paginated.
- `drizzle-kit` migrations cannot be run via the Data API driver — a separate migration runner (`services/migrate.ts`) is used with direct database credentials at deploy time.
- Aurora Serverless v2 requires a VPC. The cluster is placed in isolated subnets (no internet access), but Lambdas connect via the Data API endpoint (public HTTPS) and do not need VPC placement themselves.
