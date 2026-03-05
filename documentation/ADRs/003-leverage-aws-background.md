# ADR-003: AWS as Cloud Service Provider

## Date

2026-03-05

## Status

Accepted

## Context

This project requires a cloud provider for compute (Lambda), storage (object storage), authentication (managed identity), a relational database, and a message queue. All major cloud providers (AWS, GCP, Azure) offer equivalent managed services for these needs.

The choice of cloud provider has a wide-ranging impact: it determines which managed services, SDKs, IAM models, and IaC tools are available, and it influences the learning value of the project.

## Decision

Use AWS as the sole cloud provider.

## Alternatives Considered

**1. Google Cloud Platform (GCP)**
GCP offers equivalent services: Cloud Run / Cloud Functions for compute, Cloud Storage for objects, Firebase Auth or Cloud Identity for authentication, Cloud SQL for relational data, and Pub/Sub for queuing.

Not chosen because GCP's IAM model, SDK patterns, and CLI tooling are less familiar. Learning a new cloud platform from scratch would significantly slow development and shift the project's focus away from full-stack TypeScript and application architecture.

**2. Microsoft Azure**
Azure offers Azure Functions, Blob Storage, Azure AD B2C (auth), Azure Database for PostgreSQL, and Azure Service Bus.

Not chosen for the same reason as GCP — no prior familiarity, and the overhead of learning Azure-specific concepts (ARM templates, Azure-specific IAM, etc.) would be a distraction from the project's core goals.

**3. Self-hosted / VPS (e.g., DigitalOcean, Hetzner)**
A VPS with Docker could run the application stack at lower cost. Self-hosted object storage (MinIO), PostgreSQL, and a Redis queue would cover the functional requirements.

Not chosen because the project is explicitly designed to practice AWS architecture, CDK infrastructure-as-code, and serverless patterns. Running self-hosted services defeats that purpose. Cost savings are not a priority over learning value.

## Reasons

- Existing AWS background means faster development — IAM, S3, Lambda, CDK, and Cognito patterns are already familiar.
- AWS has the largest market share among cloud providers, making the skills built here broadly applicable.
- AWS CDK (TypeScript) is the chosen IaC tool — see infrastructure design — and is a native AWS product with first-class support for all services used in this project.
- The specific combination of Aurora Serverless v2 with Data API (no VPC), S3 Glacier Flexible Retrieval, Cognito, and SQS is purpose-built for the cost and architecture goals of this project, and all of these are AWS-specific features.

## Consequences

- AWS pricing is generally higher than alternative providers for equivalent compute. Cost is managed through serverless patterns (Lambda, Aurora Serverless) and cold storage (Glacier) rather than by switching providers — see [ADR-004](004-using-S3-glacier-flexible.md) and [ADR-005](005-using-aurora-serverless.md).
- The project is fully locked in to AWS. Moving to another provider would require rewriting the infrastructure layer, replacing Cognito, and migrating storage.
