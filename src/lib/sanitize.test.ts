import { describe, expect, it } from "vitest";
import { sanitizeAgentText } from "./sanitize";

describe("sanitizeAgentText", () => {
  it("strips <script> blocks", () => {
    expect(sanitizeAgentText("<script>alert(1)</script>hello")).toBe("hello");
  });

  it("strips <style> blocks", () => {
    expect(
      sanitizeAgentText("<style>body{display:none}</style>hi"),
    ).toBe("hi");
  });

  it("removes on* event handlers", () => {
    const out = sanitizeAgentText('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
  });

  it("neutralizes javascript: URLs", () => {
    const out = sanitizeAgentText('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });

  it("keeps normal markdown content", () => {
    const text = "**Bridge** 5 USDC from Arc to Base";
    expect(sanitizeAgentText(text)).toBe(text);
  });
});
