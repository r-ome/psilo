# ADR-009: Aurora Data API to Avoid VPC for Lambda Database Access

## Status

Accepted

## Context

Aurora Serverless v2 runs inside a VPC. By default, compute resources (like Lambda functions) must also be placed inside the same VPC to reach the database. This is the standard RDS connectivity model.

However, placing Lambda functions inside a VPC introduces significant operational and cost overhead, particularly for a low-traffic personal project.

Aurora Serverless v2 offers an alternative: the **RDS Data API**, an HTTP-based interface that allows clients outside the VPC to execute SQL queries using IAM credentials. Drizzle ORM supports this via the `drizzle-orm/aws-data-api/pg` driver.

## Decision

Enable the RDS Data API on the Aurora cluster. All Lambda functions connect to the database via the Data API using IAM authentication and Secrets Manager for credentials. Lambda functions remain outside any VPC.

## Alternatives Considered

**1. Lambda functions inside the VPC (standard approach)**
Lambda functions are placed in private subnets within the same VPC as Aurora. This is the typical production pattern and provides the lowest latency.

Rejected because:
- Requires NAT gateways for Lambda to reach AWS service APIs (S3, Cognito, Secrets Manager, SQS). NAT gateways cost ~$32/month each — significant for a personal project with near-zero traffic.
- VPC cold starts add latency to Lambda invocations.
- Network configuration (subnets, security groups, route tables) adds complexity with limited benefit at this scale.

**2. Lambda inside VPC + RDS Proxy**
RDS Proxy sits inside the VPC, pools database connections, and allows Lambda to connect without exhausting Aurora's connection limit. Recommended for high-concurrency workloads.

Rejected because connection pooling is unnecessary for a single-user app with minimal concurrency. RDS Proxy also has an additional hourly cost.

**3. Lambda inside VPC + VPC Endpoints for AWS services**
VPC Endpoints allow Lambda to reach AWS APIs (S3, SQS, etc.) without NAT gateways, at a lower cost. This would avoid the NAT gateway cost while keeping Lambda in the VPC.

Not pursued because it still requires subnet/security group management for each endpoint, and the Data API already solves the connectivity problem more simply.

## Reasons

- Eliminates NAT gateway costs entirely — the largest infrastructure cost driver for VPC-based Lambda architectures.
- Aurora remains in isolated subnets (no public access), preserving network security. Data API requests are authenticated via IAM, not open network access.
- Simpler CDK stack — no VPC attachment on Lambda functions, no subnet/security group configuration.
- Drizzle ORM's `aws-data-api/pg` driver abstracts the HTTP calls, so application code looks identical to a standard Drizzle setup.
- Acceptable latency trade-off: Data API adds ~10–50ms of overhead per query. For a personal app, this is negligible.

## Consequences

- Data API has a **64 KB response size limit per query**. Bulk queries returning large result sets need to be paginated.
- Data API is only available in specific AWS regions. Deployment is constrained to supported regions.
- Slightly higher per-query latency compared to a direct TCP connection.
- `drizzle-kit` migrations cannot run via the Data API driver — a separate migration runner (`services/migrate.ts`) is used with direct credentials at deploy time.
- The Lambda execution role must have `rds-data:ExecuteStatement` and `secretsmanager:GetSecretValue` permissions instead of VPC-level network access.
