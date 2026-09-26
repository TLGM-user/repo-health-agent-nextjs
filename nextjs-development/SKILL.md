---
name: nextjs-development
description: Build and maintain reliable Next.js App Router applications with TypeScript, React Server Components, route handlers, and Tailwind CSS.
---

# nextjs-development

Use this skill for feature work, bug fixes, refactors, and reviews in Next.js applications.

## When to use

- The project uses `next`, `react`, or the Next.js App Router (`app/` or `src/app/`).
- The request involves pages, layouts, route handlers, server actions, metadata, rendering, caching, navigation, or React components.
- The request involves integrating a backend or database into a Next.js UI.

## Instructions

1. Inspect the project structure, `package.json`, TypeScript configuration, and the nearest related route or component before editing.
2. Preserve the existing App Router conventions. Keep components server-rendered by default; add `"use client"` only when browser APIs, state, effects, or event handlers require it.
3. Keep secrets and database access on the server. Never expose environment variables without the `NEXT_PUBLIC_` prefix, credentials, or connection strings to client components.
4. Use typed props and explicit response types. Validate untrusted route parameters, form data, query strings, and external API responses at the boundary.
5. Follow the project's existing styling and component patterns. Prefer shared components and utilities over duplicating markup or logic.
6. For route handlers, return appropriate HTTP status codes and clear error responses. Do not hide failures behind empty or success-shaped fallbacks.
7. Consider loading, error, empty, and pending states for user-facing async flows. Use `loading.tsx`, `error.tsx`, `not-found.tsx`, Suspense, or pending UI where appropriate.
8. Be deliberate about caching and revalidation. Do not add `force-dynamic`, `no-store`, or cache invalidation unless the data freshness requirement calls for it.
9. Preserve accessibility: use semantic HTML, labels for controls, keyboard-operable interactions, meaningful link text, and appropriate image alt text.
10. Update directly related documentation when behavior or setup changes.
11. Validate the smallest relevant surface after changes, normally with the project's lint, type-check, build, or focused tests. Report any pre-existing failures separately.

## Project-specific defaults

- This project uses Next.js 16, React 19, TypeScript, and Tailwind CSS 4.
- Source code lives under `src/`; routes belong under `src/app/`, and reusable UI belongs under `src/components/`.
- Use the `@/*` path alias for imports from `src/`.
- Use the existing npm scripts (`npm run lint`, `npm run build`, and `npm run dev`) rather than introducing alternate commands.
