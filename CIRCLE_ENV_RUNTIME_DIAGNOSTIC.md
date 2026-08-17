# Circle API Key Runtime Diagnostic

## Goal
Diagnose why the Preview deployment reports `CIRCLE_API_KEY is not configured` even when the user says the key exists in Vercel.

## Current facts
- `src/lib/circle-pw-server.ts` reads only `process.env.CIRCLE_API_KEY`.
- `src/app/api/circle/pw/token/route.ts` returns HTTP 500 with `CIRCLE_API_KEY is not configured` when that server-side value is missing.
- The bridge fix commit is `071e41b0d9261ef46e4387a66baa8c9c681a99e6`.
- Do not expose or log the actual key.

## Required diagnosis
1. Confirm the exact Vercel deployment being tested.
2. Confirm whether the deployment is Preview or Production.
3. Confirm the deployment was created after the environment variable was added/changed.
4. Confirm `CIRCLE_API_KEY` exists in the appropriate Vercel environment scope without printing its value.
5. Add a temporary safe diagnostic endpoint or equivalent internal diagnostic that returns only:
   - `configured: boolean`
   - `source: server-runtime`
   - `deploymentCommit` if safely available
   Never return the key, a prefix, suffix, length, hash, or any secret-derived value.
6. Verify that the Circle API route runs in Node.js server runtime and is dynamic.
7. Verify there is no `NEXT_PUBLIC_CIRCLE_API_KEY` substitution in the server route.
8. Verify no build-time inlining or static caching causes the old environment state to persist.
9. Redeploy after any environment change.
10. Test the diagnostic on the exact Preview URL.
11. Test `POST /api/circle/pw/token` with a test email only after the runtime diagnostic reports `configured: true`.

## Security requirements
- Never print the key.
- Never return the key to the browser.
- Never commit `.env`, `.env.local`, Vercel secrets, or Circle credentials.
- Remove the diagnostic endpoint before the final production PR, or replace it with a permanently safe health check that exposes no secret-derived information.

## Do not change yet
- Do not change Circle API endpoints.
- Do not change bridge orchestration.
- Do not change wallet adapters.
- Do not rotate the Circle key.
- Do not change RPC configuration.

First prove whether the Preview server runtime actually receives `CIRCLE_API_KEY`. Only then make the minimum required fix.
