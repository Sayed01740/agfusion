import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitError, isRetryableError } from "@circle-fin/app-kit";
import {
  assertCircleBridgeChains,
  buildBridgeParams,
  findDestinationHash,
  isDestinationStepName,
  resolveBridgeOutcome,
  shouldRetryBridge,
  toTxSteps,
  verifyDestinationStep,
  type BridgeSdkResult,
} from "./appkit-service";
import {
  deriveBridgeState,
  initBridgeState,
  isBurnConfirmed,
} from "@/lib/bridge-state";

// Minimal sessionStorage stub so persisted bridge-state round-trips work in Node.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).window = {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
});

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const DEST_HASH = "0x".padEnd(66, "a1");
const BURN_HASH = "0x".padEnd(66, "b2");
const OTHER_HASH = "0x".padEnd(66, "c3");

function retryableKitError(): KitError {
  return new KitError({
    code: 3002,
    name: "NETWORK_TIMEOUT",
    type: "NETWORK",
    recoverability: "RETRYABLE",
    message: "Request timed out",
  });
}

function fatalKitError(): KitError {
  return new KitError({
    code: 5099,
    name: "ONCHAIN_UNKNOWN_BLOCKCHAIN_ERROR",
    type: "ONCHAIN",
    recoverability: "FATAL",
    message: "execution reverted",
  });
}

function successWithSteps(steps: BridgeSdkResult["steps"]): BridgeSdkResult {
  return { state: "success", steps };
}

/** Mock fetch: any eth_getTransactionReceipt call returns `receipt` (or null). */
function stubReceiptFetch(receipt: { status: string } | null) {
  const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (body.method === "eth_getTransactionReceipt") {
      return {
        ok: true,
        json: async () => ({ jsonrpc: "2.0", id: 1, result: receipt }),
      } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: null }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Clean persisted bridge state between tests (Node-safe stub).
  (globalThis as any).window = undefined;
});

describe("bridge orchestration — one adapter for source and destination", () => {
  it("uses the SAME adapter object for from.adapter and to.adapter (Arc → Base)", () => {
    const adapter = { name: "single-adapter" };
    const params = buildBridgeParams({
      fromChain: "Arc_Testnet",
      toChain: "Base_Sepolia",
      amount: "1.5",
      adapter,
    });
    expect((params.from as any).adapter).toBe(adapter);
    expect((params.to as any).adapter).toBe(adapter);
    expect((params.from as any).adapter).toBe((params.to as any).adapter);
  });

  it("uses the SAME adapter object for from.adapter and to.adapter (Base → Arc)", () => {
    const adapter = { name: "single-adapter" };
    const params = buildBridgeParams({
      fromChain: "Base_Sepolia",
      toChain: "Arc_Testnet",
      amount: "0.25",
      adapter,
    });
    expect((params.from as any).adapter).toBe((params.to as any).adapter);
  });

  it("never builds a destination adapter or chain-locks either side (no targetChainId)", () => {
    const params = buildBridgeParams({
      fromChain: "Arc_Testnet",
      toChain: "Base_Sepolia",
      amount: "1",
      adapter: { name: "a" },
    });
    const json = JSON.stringify(params);
    expect(json).not.toContain("targetChainId");
    expect((params.from as any).adapter).toBe((params.to as any).adapter);
  });

  it("carries the mint recipient as recipientAddress without changing the adapter", () => {
    const adapter = { name: "a" };
    const params = buildBridgeParams({
      fromChain: "Arc_Testnet",
      toChain: "Base_Sepolia",
      amount: "2",
      recipient: "0xRecipient",
      adapter,
    });
    expect((params.to as any).recipientAddress).toBe("0xRecipient");
    expect((params.to as any).adapter).toBe(adapter);
    expect((params.from as any).adapter).toBe(adapter);
  });
});

describe("bridge orchestration — no KIT_KEY hard gate", () => {
  it("does not pass config.kitKey (or any config) to kit.bridge", () => {
    const params = buildBridgeParams({
      fromChain: "Arc_Testnet",
      toChain: "Base_Sepolia",
      amount: "1",
      adapter: { name: "a" },
    });
    expect(params.config).toBeUndefined();
    expect(JSON.stringify(params)).not.toContain("KIT_KEY");
    expect(JSON.stringify(params)).not.toContain("kitKey");
  });
});

describe("bridge orchestration — retryability", () => {
  it("retryable SDK error → shouldRetryBridge true (retry exactly once)", () => {
    const result: BridgeSdkResult = {
      state: "error",
      steps: [
        { name: "approve", state: "success", txHash: BURN_HASH },
        { name: "burn", state: "error", error: retryableKitError() },
      ],
    };
    expect(shouldRetryBridge(result, isRetryableError)).toBe(true);
  });

  it("non-retryable SDK error → shouldRetryBridge false (no retryBridge call)", () => {
    const result: BridgeSdkResult = {
      state: "error",
      steps: [
        { name: "burn", state: "error", error: fatalKitError() },
      ],
    };
    expect(shouldRetryBridge(result, isRetryableError)).toBe(false);
  });

  it("user rejection is never retried", () => {
    const result: BridgeSdkResult = {
      state: "error",
      steps: [
        { name: "burn", state: "error", error: new Error("User rejected the request") },
      ],
    };
    expect(shouldRetryBridge(result, isRetryableError)).toBe(false);
  });

  it("wrong chain / plain errors are never blindly retried", () => {
    const result: BridgeSdkResult = {
      state: "error",
      steps: [
        { name: "mint", state: "error", error: new Error("The current chain of the wallet does not match the target chain") },
      ],
    };
    expect(shouldRetryBridge(result, isRetryableError)).toBe(false);
  });

  it("missing failed step or missing error → no retry", () => {
    expect(
      shouldRetryBridge({ state: "error", steps: [] }, isRetryableError),
    ).toBe(false);
    expect(
      shouldRetryBridge(
        { state: "error", steps: [{ name: "burn", state: "error" }] },
        isRetryableError,
      ),
    ).toBe(false);
    // state !== "error" → no retry
    expect(
      shouldRetryBridge(
        { state: "success", steps: [{ name: "burn", state: "error", error: retryableKitError() }] },
        isRetryableError,
      ),
    ).toBe(false);
  });
});

describe("bridge orchestration — destination verification", () => {
  it("requires the destination mint/receive hash for success (never an arbitrary last hash)", () => {
    // burn succeeded and has a hash, but no mint step → pending/retryable
    const steps: BridgeSdkResult["steps"] = [
      { name: "approve", state: "success", txHash: BURN_HASH },
      { name: "burn", state: "success", txHash: BURN_HASH },
      { name: "fetchAttestation", state: "success" },
    ];
    const outcome = resolveBridgeOutcome({
      sdkState: "success",
      sdkSteps: steps,
    });
    expect(outcome.status).toBe("retryable");
    expect(outcome.destHash).toBeUndefined();
  });

  it("a later non-destination hash (e.g. approve after mint) is not used as destination hash", () => {
    const steps: BridgeSdkResult["steps"] = [
      { name: "burn", state: "success", txHash: BURN_HASH },
      { name: "mint", state: "success", txHash: DEST_HASH },
      { name: "approve", state: "success", txHash: OTHER_HASH },
    ];
    expect(findDestinationHash(steps)).toBe(DEST_HASH);
  });

  it("recognizes mint / receive / destination / deposit as destination step names", () => {
    for (const name of ["mint", "Mint", "receive", "ReceiveMessage", "destination", "deposit"]) {
      expect(isDestinationStepName(name)).toBe(true);
    }
    expect(isDestinationStepName("approve")).toBe(false);
    expect(isDestinationStepName("burn")).toBe(false);
  });

  it("SDK error state is never success even when a destination hash exists", () => {
    const outcome = resolveBridgeOutcome({
      sdkState: "error",
      sdkSteps: [{ name: "mint", state: "success", txHash: DEST_HASH }],
    });
    expect(outcome.status).toBe("error");
  });

  it("destination receipt reverted → error", async () => {
    stubReceiptFetch({ status: "0x0" });
    const verified = await verifyDestinationStep({
      sdkState: "success",
      sdkSteps: [{ name: "mint", state: "success", txHash: DEST_HASH }],
      toChain: "Base_Sepolia",
      attempts: 1,
      delayMs: 0,
    });
    expect(verified.status).toBe("error");
    expect(verified.destHash).toBe(DEST_HASH);
  });

  it("destination receipt confirmed (0x1) → success", async () => {
    stubReceiptFetch({ status: "0x1" });
    const verified = await verifyDestinationStep({
      sdkState: "success",
      sdkSteps: [{ name: "mint", state: "success", txHash: DEST_HASH }],
      toChain: "Base_Sepolia",
      attempts: 1,
      delayMs: 0,
    });
    expect(verified.status).toBe("success");
    expect(verified.destHash).toBe(DEST_HASH);
  });

  it("destination receipt missing → retryable/pending", async () => {
    stubReceiptFetch(null);
    const verified = await verifyDestinationStep({
      sdkState: "success",
      sdkSteps: [{ name: "mint", state: "success", txHash: DEST_HASH }],
      toChain: "Base_Sepolia",
      attempts: 1,
      delayMs: 0,
    });
    expect(verified.status).toBe("retryable");
    expect(verified.destHash).toBe(DEST_HASH);
  });
});

describe("bridge orchestration — wallet support", () => {
  it("Circle Email Wallet: Arc Testnet → Base Sepolia is allowed", () => {
    expect(() =>
      assertCircleBridgeChains("Arc_Testnet", "Base_Sepolia"),
    ).not.toThrow();
  });

  it("Circle Email Wallet: Base Sepolia → Arc Testnet is allowed", () => {
    expect(() =>
      assertCircleBridgeChains("Base_Sepolia", "Arc_Testnet"),
    ).not.toThrow();
  });

  it("Circle Email Wallet: unsupported chains are rejected", () => {
    expect(() =>
      assertCircleBridgeChains("Arc_Testnet", "Ethereum_Sepolia"),
    ).toThrow(/Arc Testnet ↔ Base Sepolia/);
  });

  it("EVM wallets (Rabby / MetaMask) build the same single-adapter params for Arc → Base", () => {
    const adapter = { name: "rabby" };
    const params = buildBridgeParams({
      fromChain: "Arc_Testnet",
      toChain: "Base_Sepolia",
      amount: "1",
      adapter,
    });
    expect((params.from as any).adapter).toBe((params.to as any).adapter);
    expect(params.amount).toBe("1");
    expect(params.token).toBe("USDC");
  });

  it("EVM wallets (Rabby / MetaMask) build the same single-adapter params for Base → Arc", () => {
    const adapter = { name: "metamask" };
    const params = buildBridgeParams({
      fromChain: "Base_Sepolia",
      toChain: "Arc_Testnet",
      amount: "0.5",
      adapter,
    });
    expect((params.from as any).adapter).toBe((params.to as any).adapter);
  });

  it("step mapping preserves per-step hashes and error messages", () => {
    const steps = toTxSteps([
      { name: "approve", state: "success", txHash: BURN_HASH },
      { name: "burn", state: "error", errorMessage: "insufficient balance" },
      { name: "mint", state: "pending" },
    ]);
    expect(steps[0]).toMatchObject({ name: "approve", state: "success", txHash: BURN_HASH });
    expect(steps[1]).toMatchObject({ name: "burn", state: "error", message: "insufficient balance" });
    expect(steps[2]).toMatchObject({ name: "mint", state: "pending" });
  });
});

describe("bridge orchestration — recovery never re-burns", () => {
  it("a confirmed burn stays confirmed across a recovery attempt (no duplicate burn)", () => {
    initBridgeState({
      txId: "tx-recovery-no-reburn",
      walletType: "evm",
      walletAddress: null,
      fromChain: "Arc_Testnet",
      toChain: "Base_Sepolia",
      token: "USDC",
      amount: "5",
    });
    // Persisted state proves the burn happened.
    const bState = deriveBridgeState("tx-recovery-no-reburn", [
      { name: "approve", state: "success", txHash: BURN_HASH },
      { name: "burn", state: "success", txHash: BURN_HASH },
    ]);
    expect(bState.burnTxHash).toBe(BURN_HASH);
    expect(isBurnConfirmed(bState)).toBe(true);

    // A recovery that only reaches attestation (no mint hash) is pending,
    // never success — and never clears the burn evidence.
    const outcome = resolveBridgeOutcome({
      sdkState: "success",
      sdkSteps: [
        { name: "burn", state: "success", txHash: BURN_HASH },
        { name: "fetchAttestation", state: "success" },
      ],
    });
    expect(outcome.status).toBe("retryable");

    const after = deriveBridgeState("tx-recovery-no-reburn", [
      { name: "burn", state: "success", txHash: BURN_HASH },
      { name: "fetchAttestation", state: "error", message: "attestation timeout" },
    ]);
    expect(after.burnTxHash).toBe(BURN_HASH);
    expect(isBurnConfirmed(after)).toBe(true);
  });
});
