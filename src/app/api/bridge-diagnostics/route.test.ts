import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { logBridgeDiagnosticEvent } from "@/lib/tx-store";

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "test-ip",
  rateLimit: () => ({ ok: true }),
}));

vi.mock("@/lib/tx-store", () => ({
  listBridgeDiagnosticEvents: vi.fn(),
  logBridgeDiagnosticEvent: vi.fn(async () => true),
}));

function jsonRequest(value: unknown): Request {
  return new Request("http://localhost/api/bridge-diagnostics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/bridge-diagnostics request hardening", () => {
  it("rejects oversized streamed bodies without relying on Content-Length", async () => {
    const request = new Request("http://localhost/api/bridge-diagnostics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "session-1", event: { detail: "x".repeat(260_000) } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, error: "payload_too_large" });
    expect(logBridgeDiagnosticEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before persistence", async () => {
    const response = await POST(new Request("http://localhost/api/bridge-diagnostics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"sessionId":',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_diagnostic_payload" });
    expect(logBridgeDiagnosticEvent).not.toHaveBeenCalled();
  });

  it("rejects non-object payloads", async () => {
    const response = await POST(jsonRequest(["not", "an", "object"]));
    expect(response.status).toBe(400);
    expect(logBridgeDiagnosticEvent).not.toHaveBeenCalled();
  });

  it("persists valid diagnostic events after redacting sensitive keys", async () => {
    const response = await POST(jsonRequest({
      sessionId: "session-1",
      walletAddress: "0x1111111111111111111111111111111111111111",
      event: { message: "bridge started", apiKey: "do-not-log", nested: { accessToken: "secret" } },
    }));

    expect(response.status).toBe(200);
    expect(logBridgeDiagnosticEvent).toHaveBeenCalledWith(
      { message: "bridge started", apiKey: "[redacted]", nested: { accessToken: "[redacted]" } },
      "session-1",
      "0x1111111111111111111111111111111111111111",
    );
  });

  it("rejects non-string walletAddress values", async () => {
    const response = await POST(jsonRequest({
      sessionId: "session-1",
      walletAddress: { unexpected: true },
      event: { message: "bridge started" },
    }));
    expect(response.status).toBe(400);
    expect(logBridgeDiagnosticEvent).not.toHaveBeenCalled();
  });
});
