import { afterEach, describe, expect, it, vi } from "vitest";
import { emitX402AuditEvent } from "./x402-audit";

afterEach(() => vi.restoreAllMocks());

describe("emitX402AuditEvent", () => {
  it("emits only fixed event metadata, reason code, and correlation ID", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const correlationId = "123e4567-e89b-42d3-a456-426614174000";

    expect(emitX402AuditEvent("verification_failed", "rpc_unavailable", correlationId))
      .toBe(correlationId);

    expect(info).toHaveBeenCalledOnce();
    const record = JSON.parse(String(info.mock.calls[0][0]));
    expect(record).toMatchObject({
      component: "x402",
      event: "verification_failed",
      reason: "rpc_unavailable",
      correlationId,
    });
    expect(Object.keys(record).sort()).toEqual([
      "component", "correlationId", "event", "reason", "timestamp",
    ]);
  });

  it("normalizes unsafe reason text and invalid correlation IDs", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    emitX402AuditEvent("dependency_unavailable", "raw error: secret-value", "caller-input");
    const record = JSON.parse(String(info.mock.calls[0][0]));
    expect(record.reason).toBe("unspecified");
    expect(record.correlationId).not.toBe("caller-input");
  });
});
