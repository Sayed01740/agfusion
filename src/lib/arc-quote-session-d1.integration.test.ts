import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { consumeArcQuoteSession, registerArcQuoteSession } from "./arc-quote-session-store";

const enabled = process.env.AGFUSION_D1_INTEGRATION === "1";
const account = "0x1111111111111111111111111111111111111111";

describe.skipIf(!enabled)("Cloudflare D1 quote-session remote integration", () => {
  it("allows exactly one concurrent consume for a registered quote session", async () => {
    const token = `d1-integration-${randomUUID()}-opaque-quote-session-token`;
    const expiresAt = Math.floor(Date.now() / 1000) + 60;

    const registered = await registerArcQuoteSession({
      token,
      account,
      chainId: 5042,
      expiresAt,
    });
    expect(registered).toEqual({ ok: true });

    const results = await Promise.all([
      consumeArcQuoteSession({ token, account, chainId: 5042 }),
      consumeArcQuoteSession({ token, account, chainId: 5042 }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect(results).toContainEqual({ ok: false, reason: "invalid_or_consumed_session" });
  });

  it("rejects a session bound to a different wallet", async () => {
    const token = `d1-account-binding-${randomUUID()}-opaque-quote-session-token`;
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    await expect(registerArcQuoteSession({ token, account, chainId: 5042, expiresAt }))
      .resolves.toEqual({ ok: true });
    await expect(consumeArcQuoteSession({
      token,
      account: "0x2222222222222222222222222222222222222222",
      chainId: 5042,
    })).resolves.toEqual({ ok: false, reason: "invalid_or_consumed_session" });
  });
});
