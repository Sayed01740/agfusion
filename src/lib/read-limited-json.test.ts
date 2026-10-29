import { describe, expect, it } from "vitest";
import { readLimitedJson } from "@/lib/read-limited-json";

describe("readLimitedJson", () => {
  it("parses valid JSON within the byte limit", async () => {
    const request = new Request("https://agfusion.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });

    await expect(readLimitedJson(request, 64)).resolves.toEqual({
      ok: true,
      value: { message: "hello" },
    });
  });

  it("rejects a declared oversized body before reading it", async () => {
    const request = new Request("https://agfusion.test/api", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "1000" },
      body: "{}",
    });

    await expect(readLimitedJson(request, 32)).resolves.toEqual({
      ok: false,
      status: 413,
      error: "payload_too_large",
    });
  });

  it("rejects an oversized streamed body even without Content-Length", async () => {
    const request = new Request("https://agfusion.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "x".repeat(128),
    });

    await expect(readLimitedJson(request, 32)).resolves.toEqual({
      ok: false,
      status: 413,
      error: "payload_too_large",
    });
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("https://agfusion.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    await expect(readLimitedJson(request, 32)).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid_json",
    });
  });
});
