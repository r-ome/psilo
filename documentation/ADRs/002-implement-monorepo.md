# ADR-002: Loose Monorepo as Repository Architecture

## Date

2026-03-05

## Status

Accepted

## Context

The project is composed of multiple independently deployable units: a Next.js frontend, AWS CDK infrastructure definitions, and several Lambda functions (photo management, album management, presigned URL generation, metadata processing, user provisioning, DLQ handler). Each unit has its own runtime, toolchain, and deployment lifecycle.

The standard practice for microservice-style projects is to split each service into its own repository (polyrepo). However, this project is also a personal learning project where development velocity and manageability take priority over strict service isolation.

The repository structure also needs to support a single CI/CD pipeline and shared tooling (Husky pre-commit hooks, lint-staged) across all packages without a complex workspace manager.

## Decision

Use a loose monorepo — all packages in a single repository, each managing its own `node_modules`. No workspace manager (no Turborepo, Nx, or npm/yarn workspaces) is used. Shared Lambda code lives in `services/shared/` as plain TypeScript files bundled by esbuild at deploy time.

## Alternatives Considered

**1. Polyrepo (one repository per service)**
Each Lambda, the frontend, and the infrastructure would live in separate repositories with their own CI/CD pipelines, versioning, and package management.

Rejected because it introduces significant overhead for a single-developer project: managing multiple GitHub repos, syncing shared code across repos, running multiple CI pipelines, and coordinating cross-service changes (e.g., a schema change affecting both a Lambda and its migration) across PR workflows. The operational cost outweighs the isolation benefit at this scale.

**2. Monorepo with a workspace manager (Turborepo / Nx)**
Turborepo or Nx would provide task caching, dependency graph awareness, and efficient parallel execution across packages. npm/yarn workspaces would hoist shared dependencies.

Rejected because the added configuration complexity is not warranted for the current number of packages. CDK's `NodejsFunction` uses esbuild for bundling, which resolves dependencies from the entry file's directory tree — this works correctly without workspace hoisting and avoids the gotchas that hoisting can introduce with native modules like `sharp`.

**3. Single-package monorepo (everything in one `package.json`)**
All code shares one `node_modules` and one build pipeline.

Rejected because the frontend (Next.js), infrastructure (CDK), and Lambda services have different dependency sets, runtime targets, and build outputs. Mixing them into one package would cause dependency conflicts and make build tooling harder to reason about.

## Reasons

- A single repository with one CI/CD workflow (`.github/workflows/infrastructure.yml`) is sufficient and easier to reason about for a solo project.
- Husky and lint-staged apply across all packages from the root `package.json`, enforcing consistent pre-commit checks (type checking, tests, build) regardless of which package is being modified.
- Shared Lambda utilities (`services/shared/`) are available to all Lambda functions without a formal package publishing step — esbuild resolves them at bundle time.
- Cross-cutting changes (e.g., schema changes requiring a Lambda update, a CDK change, and a migration) can be made and reviewed in a single PR.

## Consequences

- Each package (`frontend/`, `infrastructure/`, each `services/*/`) manages its own `node_modules`. Running `npm install` requires `cd`-ing into each package separately.
- CI/CD installs dependencies for all packages on every relevant pipeline run, even for packages that haven't changed. Path filters in the workflow (`infrastructure/**`, `services/**`) partially mitigate unnecessary deploys.
- If the project grows significantly (more contributors, more services), migrating from this loose structure to a workspace-managed monorepo or polyrepo would require effort. This is an accepted trade-off.
