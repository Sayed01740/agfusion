import { describe, expect, it } from "vitest";
import { readLimitedJson } from "@/lib/read-limited-json";

function request(body: string, headers?: HeadersInit): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...Object.fromEntries(new Headers(headers).entries()) },
    body,
  });
}

describe("readLimitedJson", () => {
  it("parses a valid body within the limit", async () => {
    await expect(readLimitedJson(request('{"message":"ok"}'), 32)).resolves.toEqual({
      ok: true,
      value: { message: "ok" },
    });
  });

  it("rejects a body larger than the cap even when Content-Length is absent", async () => {
    const req = request(JSON.stringify({ message: "x".repeat(100) }));
    await expect(readLimitedJson(req, 32)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("rejects a body when Content-Length overstates the cap", async () => {
    const req = request('{"ok":true}', { "content-length": "1000" });
    await expect(readLimitedJson(req, 32)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("rejects malformed JSON", async () => {
    await expect(readLimitedJson(request('{"broken":'), 32)).resolves.toEqual({
      ok: false,
      reason: "invalid_json",
    });
  });

  it("rejects invalid UTF-8", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      body: new Uint8Array([0xc3, 0x28]),
    });
    await expect(readLimitedJson(req, 32)).resolves.toEqual({
      ok: false,
      reason: "invalid_json",
    });
  });
});
