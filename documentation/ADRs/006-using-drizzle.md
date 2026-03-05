# ADR-006: Drizzle ORM for Database Access

## Date

2026-03-05

## Status

Accepted

## Context

Lambda functions need to read and write relational data: querying photos and albums by user ID, inserting photo metadata after processing, managing album-photo associations. The database is Aurora Serverless v2 accessed via the RDS Data API — see [ADR-009](009-aurora-data-api-no-vpc.md).

The ORM or query layer must:
- Support TypeScript natively with full type inference on queries and results
- Work with the Aurora RDS Data API driver (HTTP-based, not a standard TCP PostgreSQL connection)
- Be lightweight enough for Lambda cold starts — bundle size matters
- Handle schema migrations

## Decision

Use Drizzle ORM with the `drizzle-orm/aws-data-api/pg` driver.

## Alternatives Considered

**1. Prisma**
Prisma is the most widely adopted TypeScript ORM. It has an excellent developer experience, Prisma Studio for visual data browsing, and strong community support.

Not chosen for two reasons:
- Prisma's query engine is a Rust binary that adds significant bundle size, which is problematic for Lambda cold starts and esbuild bundling.
- Prisma does not support the AWS RDS Data API natively. Using Prisma with Aurora Serverless v2 would require either placing Lambdas in a VPC (see [ADR-009](009-aurora-data-api-no-vpc.md) for why this was rejected) or using a workaround adapter.
- Prisma has already been used in prior projects; Drizzle offers an opportunity to explore a newer alternative.

**2. Kysely**
Kysely is a type-safe SQL query builder (not a full ORM). It provides excellent TypeScript ergonomics and is lightweight.

Not chosen because Kysely's Data API support requires a community adapter (`kysely-data-api`), which adds an unvetted dependency. Drizzle provides first-party Data API support via `drizzle-orm/aws-data-api/pg`.

**3. Raw `@aws-sdk/client-rds-data`**
Writing raw SQL with the Data API client is possible and has zero abstraction overhead.

Not chosen because it requires manual parameter binding, result mapping, and migration management. The type safety benefits alone make an ORM worthwhile for a TypeScript project.

**4. TypeORM**
TypeORM is a mature ORM with decorator-based schema definition and Data Mapper / Active Record patterns.

Not chosen because TypeORM has known issues with TypeScript strict mode, its decorator-heavy API is verbose, and it does not natively support the RDS Data API.

## Reasons

- Drizzle is the only major TypeScript ORM with first-party support for the AWS RDS Data API via `drizzle-orm/aws-data-api/pg`, making it the natural fit for this stack.
- Schema is defined in TypeScript (`services/shared/schema.ts`) and inferred directly into query types — no code generation step required, unlike Prisma.
- Drizzle has a minimal runtime footprint. The ORM itself adds very little to Lambda bundle size compared to Prisma's query engine binary.
- `drizzle-kit` handles schema migrations via SQL files stored in `services/migrations/`, giving full visibility into what SQL is executed.
- The query API is close to raw SQL, making it straightforward to understand what queries are being issued — important for debugging Data API calls.

## Consequences

- Drizzle is a newer library with a smaller community than Prisma. Some edge cases may have less documentation or fewer Stack Overflow answers.
- `drizzle-kit` migrations cannot run through the Data API driver — they require a direct TCP connection. This means migrations are run separately via `services/migrate.ts` using direct credentials, rather than being integrated into the CDK deploy pipeline automatically.
- Schema changes require updating `services/shared/schema.ts`, generating a migration with `drizzle-kit`, and running the migration manually before or after deploying the updated Lambda.
