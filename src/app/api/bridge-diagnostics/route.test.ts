import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  logBridgeDiagnosticEvent: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "bridge-diagnostics-body-limit-test",
  rateLimit: () => ({ ok: true }),
}));
vi.mock("@/lib/tx-store", () => ({
  listBridgeDiagnosticEvents: vi.fn(),
  logBridgeDiagnosticEvent: mocks.logBridgeDiagnosticEvent,
}));

afterEach(() => vi.clearAllMocks());

describe("POST /api/bridge-diagnostics request-body limit", () => {
  it("rejects oversized streamed bodies even without trusting Content-Length", async () => {
    const response = await POST(new Request("http://localhost/api/bridge-diagnostics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "session-test", event: { note: "x".repeat(256_001) } }),
    }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, error: "payload_too_large" });
    expect(mocks.logBridgeDiagnosticEvent).not.toHaveBeenCalled();
  });

  it("rejects non-object JSON before logging an event", async () => {
    const response = await POST(new Request("http://localhost/api/bridge-diagnostics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_diagnostic_payload" });
    expect(mocks.logBridgeDiagnosticEvent).not.toHaveBeenCalled();
  });
});
