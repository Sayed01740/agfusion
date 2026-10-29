import { describe, expect, it } from "vitest";
import { readLimitedText } from "./read-limited-text";

describe("readLimitedText", () => {
  it("preserves the exact body text under the byte limit", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: '{"jsonrpc":"2.0","method":"eth_chainId"}',
    });
    await expect(readLimitedText(request, 1024)).resolves.toEqual({
      ok: true,
      value: '{"jsonrpc":"2.0","method":"eth_chainId"}',
    });
  });

  it("rejects a body exceeding the limit even without a length header", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: "x".repeat(1025),
    });
    await expect(readLimitedText(request, 1024)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("allows requests without a body for proxy compatibility", async () => {
    const request = new Request("http://localhost/test", { method: "POST" });
    await expect(readLimitedText(request, 1024)).resolves.toEqual({ ok: true, value: "" });
  });

  it("rejects invalid UTF-8", async () => {
    const body = new Uint8Array([0xc3, 0x28]);
    const request = new Request("http://localhost/test", { method: "POST", body });
    await expect(readLimitedText(request, 1024)).resolves.toEqual({
      ok: false,
      reason: "invalid_body",
    });
  });
});
