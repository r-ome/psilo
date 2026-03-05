# PSILO

- [Summary](#summary)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [AWS Architecture](#aws-architecture)
- [Key Decisions](#key-decisions)

# Summary

P*ersonal* Silo. A personal cloud storage built with AWS, NextJS, Typescript. Designed as a self-hosted alternative to commercial storage solutions. Optimized for cost using S3 Glacier Flexible Retrieval for cold storage.

Built as a learning project to explore AWS architecture, CDK infrastructure-as-code,
and full-stack TypeScript. Integrated with Claude Code for AI-assisted development.

# Getting Started

## Prerequisites

- Node.js v23+
- AWS CLI configured with appropriate credentials
- AWS CDK v2
- An AWS account

## AWS Service (Auto-provisioned via CDK)

- Provisioned automatically via AWS CDK. See `infrastructure/` for the full stack definition.
  - Core services include:
    - Cognito - authentication
    - API Gateway + Lambda - request handling and business logic
    - S3 - object storage
    - SQS - handling upload jobs for big file uploads
    - Aurora Serverless v2 - stores users and photo metadata

# Project Structure

```
├── frontend/ # Next.js app
├── infrastructure/ # AWS CDK stacks
└── services/ # Lambda functions
```

### Frontend

The user-facing application built with Next.js and Typescript. Handles all UI routing, and client-side logic. Communicates with backend services via API Gateway.

### Infrastructure

AWS CDK project that provisions and manages all cloud resources. Running the CDK deploy here will automatically set up all required AWS Services (Cognito, Lambda, API Gateway, etc). see `infrastructure/` for stack definitions.

### Services

Lambda functions written in Typescript, each handling a specific domain (photos, albums, etc). Deployed automatically as a part of the infrastructure stack.

# Tech Stack

| Layer          | Technology                      |
| -------------- | ------------------------------- |
| Frontend       | Next.js, TypeScript             |
| Backend        | AWS Lambda, Node.js v23         |
| Database       | Aurora Serverless (Drizzle ORM) |
| Infrastructure | AWS CDK                         |
| Storage        | S3 Glacier Flexible Retrieval   |
| Auth           | Cognito                         |
| Queue          | SQS                             |

# AWS Architecture

```mermaid
graph TD
User["User (Browser)"]
FE["Frontend<br>Next.js"]
APIGW["API Gateway"]
Cognito["Cognito<br>Auth"]
Lambda["Lambda Functions<br>(photos, albums, users)"]
SQS["SQS<br>Upload Queue"]
S3["S3 Glacier<br>Flexible Retrieval"]
Aurora["Aurora Serverless<br>Metadata"]
User --> FE
FE --> Cognito
FE --> APIGW
APIGW --> Lambda
Lambda --> SQS
Lambda --> S3
Lambda --> Aurora
SQS --> Lambda
```

# Status

🚧 Currently in active development

- [x] Infrastructure Setup
- [x] Authentication (Cognito)
- [x] File Upload
- [x] File Retrieval
- [ ] Album Management
- [ ] Storage usage dashboard
- [ ] Photo sorting and filtering
- [ ] Image optimization

# Key Decisions

- **S3 Glacier Flexible Retrieval** - cost optimization for cold storage.
