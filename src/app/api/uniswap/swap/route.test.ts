import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const mocks = vi.hoisted(() => ({
  decrypt: vi.fn(),
  createReceiptTicket: vi.fn(),
  preflight: vi.fn(),
  approval: vi.fn(),
  permit: vi.fn(),
  validateSwap: vi.fn(),
  simulate: vi.fn(),
  consume: vi.fn(),
}));

vi.mock("@/blockchain/uniswap-quote-session", () => ({
  decryptArcUniswapQuoteSession: mocks.decrypt,
  createArcUniswapReceiptTicket: mocks.createReceiptTicket,
}));
vi.mock("@/blockchain/uniswap-permit2-preflight", () => ({
  readArcMainnetPermit2Preflight: mocks.preflight,
  buildExactPermit2Approval: mocks.approval,
  simulateArcMainnetSwapTransaction: mocks.simulate,
}));
vi.mock("@/blockchain/uniswap-permit2", () => ({
  validateArcPermit2Signature: mocks.permit,
}));
vi.mock("@/blockchain/uniswap-mainnet-adapter", () => ({
  validateArcMainnetSwapTransaction: mocks.validateSwap,
}));
vi.mock("@/lib/arc-quote-session-store", () => ({ consumeArcQuoteSession: mocks.consume }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "uniswap-swap-prepare-test",
  rateLimit: () => ({ ok: true }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  session.permitData = null;
  vi.resetAllMocks();
});

const now = 1_800_000_000;
const account = "0x1111111111111111111111111111111111111111";
const tokenIn = "0x3600000000000000000000000000000000000000";
const tokenOut = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const quote = {
  input: { token: tokenIn, amount: "1000000" },
  output: { token: tokenOut, amount: "900000", minimumAmount: "891000", recipient: account },
};
const permitData = {
  domain: { name: "Permit2", version: "1", chainId: 5042, verifyingContract: "0x000000000022D473030F116dDEE9F6B43aC78BA3" },
  values: {
    details: { token: tokenIn, amount: "1000000", expiration: String(now + 900), nonce: "5" },
    spender: "0x8702463e73f74d0b6765aBceb314Ef07aCb92650",
    sigDeadline: String(now + 600),
  },
  types: {},
};
const session = {
  version: 1,
  issuedAt: now - 2,
  expiresAt: now + 58,
  chainId: 5042,
  account,
  tokenIn,
  tokenOut,
  amountIn: "1000000",
  quotedAmountOut: "900000",
  minimumAmountOut: "891000",
  quote,
  permitData: null as Record<string, unknown> | null,
  requestId: "quote-test",
};
const preflightState = {
  hasTokenBalance: true,
  hasGasReserve: true,
  requiresErc20Approval: false,
  permit2AllowanceToRouter: 2_000_000n,
  permit2Expiration: now + 1200,
  permit2Nonce: 5,
  nativeGasBalance: 30_000_000_000_000_000n,
};
const swap = {
  chainId: 5042,
  from: account,
  to: "0x8702463e73f74d0b6765aBceb314Ef07aCb92650",
  data: "0x1234",
  value: "0",
  gasLimit: "300000",
  maxFeePerGas: "1000000000",
};
const validated = {
  chainId: 5042,
  from: account,
  to: swap.to,
  data: swap.data,
  value: "0",
  deadline: 1_800_000_600n,
  commandNames: ["V3_SWAP_EXACT_IN"],
  amountIn: 1_000_000n,
  minimumAmountOut: 891_000n,
};
const simulation = {
  estimatedGas: 250_000n,
  maxFeePerGas: 1_000_000_000n,
  estimatedGasCost: 250_000_000_000_000n,
  requiredNativeBalance: 15_250_000_000_000_000n,
};

function request(body: unknown) {
  return new Request("http://localhost/api/uniswap/swap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setup() {
  session.permitData = null;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now * 1000));
  vi.stubEnv("AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED", "true");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("AGFUSION_QUOTE_SESSION_SECRET", "test-only-quote-session-secret-with-over-32-bytes");
  vi.stubEnv("UNISWAP_API_KEY", "test-uniswap-key");
  mocks.decrypt.mockReturnValue(session);
  mocks.consume.mockResolvedValue({ ok: true });
  mocks.createReceiptTicket.mockReturnValue({ token: "encrypted-receipt-ticket", expiresAt: now + 86400 });
  mocks.preflight.mockResolvedValue(preflightState);
  mocks.validateSwap.mockReturnValue(validated);
  mocks.simulate.mockResolvedValue(simulation);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    requestId: "swap-request",
    swap,
  }), { status: 200, headers: { "content-type": "application/json" } })));
}

describe("POST /api/uniswap/swap", () => {
  it("reports the read-only preparation gate without exposing configuration", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ enabled: false, executionEnabled: false });
  });

  it("never enables transaction preparation in Production even if the flag is set", async () => {
    vi.stubEnv("AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    const response = await POST(request({ quoteSession: "opaque" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "mainnet_swap_preparation_disabled" });
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it("fails closed unless Preview transaction preparation is explicitly enabled", async () => {
    const response = await POST(request({ quoteSession: "opaque" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "mainnet_swap_preparation_disabled" });
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it("requires a valid encrypted quote session", async () => {
    vi.stubEnv("AGFUSION_MAINNET_SWAP_PREPARATION_ENABLED", "true");
    mocks.decrypt.mockImplementation(() => { throw new Error("bad session"); });
    const response = await POST(request({ quoteSession: "opaque" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_or_expired_quote_session" });
  });

  it("rejects a quote-session replay before calling Uniswap", async () => {
    setup();
    mocks.consume.mockResolvedValue({ ok: false, reason: "invalid_or_consumed_session" });
    const response = await POST(request({ quoteSession: "opaque" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "quote_session_already_used" });
    expect(mocks.consume).toHaveBeenCalledWith({ token: "opaque", account, chainId: 5042 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed when the durable quote-session store is unavailable", async () => {
    setup();
    mocks.consume.mockResolvedValue({ ok: false, reason: "database_unavailable" });
    const response = await POST(request({ quoteSession: "opaque" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "quote_session_store_unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires exact ERC-20 approval before calling Uniswap", async () => {
    setup();
    mocks.preflight.mockResolvedValue({ ...preflightState, requiresErc20Approval: true });
    mocks.approval.mockReturnValue({
      chainId: 5042, from: account, to: tokenIn, data: "0x095ea7b3", value: "0",
      spender: "0x000000000022D473030F116dDEE9F6B43aC78BA3", amount: 1_000_000n,
    });
    const response = await POST(request({ quoteSession: "opaque" }));
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data).toMatchObject({ error: "erc20_permit2_approval_required", approvalTransaction: { amount: "1000000" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires a signature when the quote includes Permit2 data", async () => {
    setup();
    session.permitData = permitData;
    const response = await POST(request({ quoteSession: "opaque" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "permit2_signature_required" });
    expect(fetch).not.toHaveBeenCalled();
    session.permitData = null;
  });

  it("validates the exact Permit2 signature, simulates, and returns only an unsigned transaction", async () => {
    setup();
    session.permitData = permitData;
    mocks.permit.mockResolvedValue({ nonce: 5 });
    const response = await POST(request({ quoteSession: "opaque", signature: "0x" + "11".repeat(65) }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.permit).toHaveBeenCalledWith(permitData, "0x" + "11".repeat(65), {
      account, token: tokenIn, amount: 1_000_000n, nowSeconds: now,
    });
    expect(mocks.validateSwap).toHaveBeenCalledOnce();
    expect(mocks.simulate).toHaveBeenCalledOnce();
    expect(data).toMatchObject({
      ok: true,
      chainId: 5042,
      transaction: { from: account, to: swap.to, data: swap.data, value: "0", gasLimit: "300000" },
      validation: { upstreamSimulation: "passed", localEthCall: "passed", localGasEstimate: "passed" },
      executionEnabled: false,
      receiptVerificationTicket: "encrypted-receipt-ticket",
    });
    expect(data.transaction).not.toHaveProperty("signature");
    expect(data).not.toHaveProperty("signedTransaction");
    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      quote,
      permitData,
      signature: "0x" + "11".repeat(65),
      simulateTransaction: true,
      safetyMode: "SAFE",
    });
  });

  it("requires a current Permit2 allowance when the quote has no permit message", async () => {
    setup();
    mocks.preflight.mockResolvedValue({ ...preflightState, permit2AllowanceToRouter: 0n });
    const response = await POST(request({ quoteSession: "opaque" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "permit2_allowance_insufficient_request_new_quote" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a signature when the quote does not contain Permit2 data", async () => {
    setup();
    const response = await POST(request({ quoteSession: "opaque", signature: "0x" + "11".repeat(65) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unexpected_permit2_signature" });
  });
});
