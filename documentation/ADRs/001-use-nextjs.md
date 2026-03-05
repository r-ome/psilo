# ADR-001: Next.js as Frontend Framework

## Date

2026-03-05

## Status

Accepted

## Context

This project requires a React-based frontend with server-side rendering, file-based routing, and the ability to run server-side logic without a separate backend service. A key requirement is the BFF (Backend for Frontend) pattern — see [ADR-007](007-using-bff-approach.md) — where the frontend intermediates between the browser and AWS services: reading httpOnly cookies and forwarding authenticated requests to API Gateway. This rules out pure client-side SPAs, which cannot safely hold server secrets or read httpOnly cookies.

The app has public routes (login, signup, forgot password) and protected routes (dashboard, albums, settings), so native route grouping and middleware-based auth guards are preferred over manual setup.

## Decision

Use Next.js (App Router) as the frontend framework.

## Alternatives Considered

**1. Remix**
Remix has a similar server-first philosophy, co-located loaders/actions, and strong support for the BFF pattern via its loader/action model. It handles form submissions, redirects, and cookies well.

Not chosen because the primary goal of this project is to learn Next.js in a real-world context. Remix has a smaller ecosystem, which would add friction during development.

**2. SvelteKit**
SvelteKit is lightweight, performant, and has excellent SSR and API route support. It would support the BFF layer via server-side `load` functions and form actions.

Not chosen because it uses Svelte rather than React. React remains the dominant frontend library in professional environments, making it a higher-value skill to practice.

**3. Plain React (Vite + React Router)**
A pure client-side SPA works well for UI rendering, but it cannot host server-side API routes. This means a separate Node.js server would be needed to implement the BFF layer, adding an extra service to run and deploy locally and in CI.

Not chosen because the BFF requirement makes a server-capable framework necessary.

**4. Vue / Nuxt**
Nuxt is a mature SSR framework with API routes, good TypeScript support, and a similar project structure to Next.js. It would work functionally.

Not chosen for the same reason as SvelteKit — Vue is outside the current learning focus, and the goal is to build proficiency in the React ecosystem.

## Reasons

- App Router provides native route groups (`(auth)`, `(protected)`), nested layouts, middleware, and server components — a natural fit for the auth-gated structure of this app.
- Next.js API routes serve as the BFF layer: they run server-side, read httpOnly cookies (`access_token`, `id_token`), and forward requests to API Gateway with Bearer tokens — keeping credentials off the browser.
- Strong TypeScript integration across pages, API routes, and middleware with minimal configuration overhead.
- Large ecosystem and documentation reduce friction for a learner hitting edge cases.

## Consequences

- The project mixes server and client components. Care must be taken to avoid leaking `server-only` imports (e.g., `env.server.ts`) into client bundles or test files — Jest will fail if it tries to import server-only modules.
- API routes add one network hop between the browser and the real AWS backend, but this is intentional and acceptable per ADR-007.
- Pre-commit hooks run `next build` on staged frontend files to catch type errors and build failures before they reach CI, increasing commit time locally.
