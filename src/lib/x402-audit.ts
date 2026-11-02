import { randomUUID } from "node:crypto";

export type X402AuditEvent =
  | "challenge_created"
  | "challenge_rejected"
  | "verification_succeeded"
  | "verification_failed"
  | "replay_rejected"
  | "rate_limited"
  | "dependency_unavailable";

const ALLOWED_EVENTS = new Set<X402AuditEvent>([
  "challenge_created",
  "challenge_rejected",
  "verification_succeeded",
  "verification_failed",
  "replay_rejected",
  "rate_limited",
  "dependency_unavailable",
]);

/**
 * Emit a privacy-conscious audit record. Only fixed event/reason codes and a
 * generated correlation ID are accepted. Never pass request data, credentials,
 * nonces, addresses, transaction hashes, or provider/ORM errors here.
 */
export function emitX402AuditEvent(
  event: X402AuditEvent,
  reason: string,
  correlationId: string = randomUUID(),
): string {
  const safeEvent = ALLOWED_EVENTS.has(event) ? event : "dependency_unavailable";
  const safeReason = /^[a-z][a-z0-9_]{0,63}$/.test(reason)
    ? reason
    : "unspecified";
  const safeCorrelationId = /^[0-9a-f-]{36}$/i.test(correlationId)
    ? correlationId
    : randomUUID();

  console.info(JSON.stringify({
    component: "x402",
    event: safeEvent,
    reason: safeReason,
    correlationId: safeCorrelationId,
    timestamp: new Date().toISOString(),
  }));
  return safeCorrelationId;
}
