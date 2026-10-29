# API Request-Body Hardening Follow-up

Audit snapshot: PR #32 head `687edd45bcbc219e67a1804722eb76de1f98f1a9` (2026-10-29).

## Scope and limits

This is a source-level inventory of `src/app/api/**/route.ts`. It distinguishes inbound request parsing from outbound provider `response.json()` calls. It is not a live penetration test and does not prove reachability or exploitability. Recheck the branch before using this as a release checklist.

## Existing bounded paths in PR #32

- `/api/ai/agent`: 16 KiB streaming body cap before schema validation.
- `/api/ai/chat`: 16 KiB streaming body cap before schema validation.
- `/api/ai/help`: 8 KiB streaming body cap before schema validation.
- `/api/ai/confirm`: 16 KiB streaming body cap plus schema validation.
- `/api/agent/policy/check`: 8 KiB streaming body cap plus schema validation.

The shared `readLimitedJson` helper counts actual streamed bytes, treats Content-Length only as an early-rejection hint, and rejects malformed JSON / invalid UTF-8.

## Additional inbound parsing paths requiring review

The following handlers still used raw `req.json()` / `request.json()` at the audit snapshot, before or during validation:

| Priority | Route | Reason for follow-up |
| --- | --- | --- |
| P1 | `/api/circle/swap/prepare` | Financial operation preparation; rate limiting and field checks occur after JSON parsing. Add a hard stream cap and object-shape guard, then test current valid payloads and Testnet semantics. |
| P1 | `/api/circle/pw/contract-execution` | Wallet contract execution; preserve exact current payload behavior and chain validation while adding a hard cap. |
| P1 | `/api/circle/pw/transactions` | Wallet transaction/challenge flows; payload variants and optional fields need regression coverage. |
| P1 | `/api/circle/pw/challenge`, `/api/circle/pw/session`, `/api/circle/pw/token`, `/api/circle/pw/wallets` | Circle Programmable Wallet flows; add endpoint-specific caps and preserve expected provider request shapes. |
| P1 | `/api/auth/circle`, `/api/auth/verify` | Authentication/token and SIWE verification payloads; bound bytes before parsing without changing signature or session semantics. |
| P2 | `/api/transactions` POST | Zod validation follows JSON parsing; cap body bytes before schema validation. |
| P2 | `/api/x402/risk-oracle` POST | Paid endpoint; cap body before payment-hash and payer validation. |
| P2 | `/api/bridge-diagnostics` POST | Existing 256,000-byte Content-Length check does not count streamed bytes, so absent/understated headers can bypass the intended cap. Use the shared streaming reader and retain redaction. |

Outbound provider `response.json()` calls in balance, Circle, and RPC-related handlers were not classified as inbound request-body findings.

## Recommended sequence

1. Keep PR #32 narrow and Draft until independent review and caller compatibility checks are complete.
2. Make a separate focused PR for auth and Circle wallet routes, with a specific body cap per route and tests for existing valid payloads, malformed JSON, absent Content-Length, understated Content-Length, and oversized bodies.
3. Separately harden swap preparation, transaction persistence, x402, and diagnostics; avoid changing chain routing, payment verification, wallet execution, or Testnet/Mainnet selection as part of body-limit changes.
4. Run typecheck, the full test suite, and production build for each PR. Do not merge or deploy without independent review.
5. Keep Mainnet changes, production secrets, signing, and transaction broadcasting out of this remediation.

## Release gate

A green CI run establishes build/test status only. It does not replace independent security review, live dedicated Arc Testnet smoke testing, or confirmation that every caller still sends an accepted payload.
