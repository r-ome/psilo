# ADR-007: Backend for Frontend (BFF) Pattern

## Date

2026-03-05

## Status

Accepted

## Context

The frontend (Next.js) needs to interact with AWS services: API Gateway for photo and album operations, and Cognito for authentication. There are two broad approaches to structuring this:

1. **Direct client calls**: The browser calls AWS services directly, using credentials obtained from Cognito (e.g., via Cognito Identity Pool for temporary IAM credentials, or by exposing API Gateway routes with CORS open to the browser).
2. **BFF (Backend for Frontend)**: Next.js API routes act as a server-side intermediary — they hold secrets, read httpOnly cookies, and forward authenticated requests to the real backend on behalf of the browser.

Authentication tokens (Cognito `access_token`, `id_token`, `refresh_token`) must be stored somewhere in the browser. The two common approaches are `localStorage`/`sessionStorage` (accessible to JavaScript) or httpOnly cookies (inaccessible to JavaScript, preventing XSS theft).

## Decision

Use the BFF pattern. Next.js API routes serve as the intermediary between the browser and AWS services. Authentication tokens are stored exclusively as httpOnly cookies, never exposed to client-side JavaScript. The browser has no direct knowledge of API Gateway URLs, Cognito configuration, or token values.

## Alternatives Considered

**1. Direct browser calls to API Gateway with tokens in localStorage**
The browser stores Cognito tokens in `localStorage` and attaches them as `Authorization` headers when calling API Gateway directly.

Rejected because `localStorage` is accessible to any JavaScript running on the page. An XSS vulnerability would allow an attacker to exfiltrate tokens, impersonate the user, and access all their data. This is the OWASP-documented risk of storing sensitive tokens in Web Storage.

**2. Direct browser calls to API Gateway with tokens in memory (React state)**
Tokens are stored in JavaScript memory only (e.g., AuthContext state), never persisted. This prevents XSS token theft from storage, but tokens are lost on page refresh, requiring re-authentication.

Rejected because it creates a poor user experience (constant re-login) and still exposes the API Gateway URL and Cognito client ID to the browser. Any JavaScript running in the page can intercept in-memory tokens via prototype pollution or other runtime attacks.

**3. Direct browser calls using Cognito Identity Pool (IAM credentials)**
Cognito Identity Pools issue temporary IAM credentials to authenticated users, scoped to specific AWS resources. The browser uses these credentials to call S3 or other AWS services directly.

Rejected because it requires managing credential refresh cycles in the browser, exposes IAM permission boundaries to client-side code, and still does not prevent XSS attacks from stealing the short-lived credentials. It also adds significant complexity to the authentication flow.

**4. Separate Node.js BFF server (not Next.js API routes)**
A standalone Express or Fastify server could serve as the BFF layer, with Next.js as a purely static frontend.

Rejected because Next.js API routes already provide this capability without needing an additional service to run, deploy, and maintain. Co-locating the BFF in the Next.js app keeps the architecture simpler and reduces operational overhead.

## Reasons

- httpOnly cookies are inaccessible to JavaScript. Even if an XSS vulnerability were introduced, tokens stored in httpOnly cookies cannot be read or exfiltrated by malicious scripts.
- The browser never sees the API Gateway URL, Cognito App Client ID, or any AWS credentials — these are environment variables on the Next.js server only. Rotating credentials or changing backend URLs requires no client-side changes.
- Next.js API routes are a natural fit for this pattern: they run server-side, can read `cookies()` from `next/headers`, and forward requests with `Authorization: Bearer <token>` to API Gateway.
- Centralising auth logic in the BFF layer means the frontend application code (React components, page logic) is kept clean — it calls `/api/photos` rather than constructing API Gateway requests manually.

## Consequences

- Every API request from the browser goes through two hops: browser → Next.js API route → API Gateway → Lambda. This adds latency (~10–50ms for the extra hop) compared to direct browser-to-API-Gateway calls.
- The Next.js server must be running for the app to function — there is no static-only deployment mode.
- Next.js API routes add surface area that requires testing. Each route must be covered by unit tests that mock cookie reading and verify correct forwarding behaviour.
- Cookie-based auth requires attention to `SameSite` and `Secure` cookie attributes in production to prevent CSRF. The current implementation sets `httpOnly: true`; `Secure` and `SameSite` attributes should be enforced in the production environment.
