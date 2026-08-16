import { beforeEach, describe, expect, it } from "vitest";
import {
  bridgeStateFromRecord,
  bridgeStateToSteps,
  deriveBridgeState,
  initBridgeState,
  isBurnConfirmed,
  loadBridgeState,
  removeBridgeState,
  saveBridgeState,
  type BridgeState,
} from "./bridge-state";

// Minimal sessionStorage stub so persistence round-trips work in Node.
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

function seed(txId = "tx1"): BridgeState {
  return initBridgeState({
    txId,
    walletType: "evm",
    walletAddress: null,
    fromChain: "Arc_Testnet",
    toChain: "Base_Sepolia",
    token: "USDC",
    amount: "5",
  });
}

describe("bridge-state", () => {
  it("initializes at INIT and persists", () => {
    const s = seed();
    expect(s.state).toBe("INIT");
    expect(loadBridgeState("tx1")?.state).toBe("INIT");
  });

  it("derives APPROVED after approve success with hash", () => {
    seed();
    const s = deriveBridgeState("tx1", [
      { name: "approve", state: "success", txHash: "0xapprove" },
    ]);
    expect(s.state).toBe("APPROVED");
    expect(s.approvalTxHash).toBe("0xapprove");
  });

  it("derives BURN_CONFIRMED once the burn has a hash", () => {
    seed();
    const s = deriveBridgeState("tx1", [
      { name: "approve", state: "success", txHash: "0xapprove" },
      { name: "burn", state: "success", txHash: "0xburn" },
    ]);
    expect(s.state).toBe("ATTESTATION_PENDING");
    expect(s.burnTxHash).toBe("0xburn");
    expect(isBurnConfirmed(s)).toBe(true);
  });

  it("never treats a confirmed burn as re-burnable", () => {
    seed();
    const s = deriveBridgeState("tx1", [
      { name: "burn", state: "success", txHash: "0xburn" },
    ]);
    expect(isBurnConfirmed(s)).toBe(true);
    // A later failure keeps the burn hash — recovery must not re-burn.
    const failed = deriveBridgeState("tx1", [
      { name: "burn", state: "success", txHash: "0xburn" },
      { name: "fetchAttestation", state: "error", message: "timeout" },
    ]);
    expect(failed.burnTxHash).toBe("0xburn");
    expect(failed.state).toBe("FAILED");
    expect(isBurnConfirmed(failed)).toBe(true);
  });

  it("derives COMPLETED when mint succeeds", () => {
    seed();
    const s = deriveBridgeState("tx1", [
      { name: "approve", state: "success", txHash: "0xapprove" },
      { name: "burn", state: "success", txHash: "0xburn" },
      { name: "fetchAttestation", state: "success" },
      { name: "mint", state: "success", txHash: "0xmint" },
    ]);
    expect(s.state).toBe("COMPLETED");
    expect(s.destinationTxHash).toBe("0xmint");
    expect(isBurnConfirmed(s)).toBe(true);
  });

  it("renders error state on the failing step", () => {
    seed();
    const s = deriveBridgeState("tx1", [
      { name: "approve", state: "error", message: "insufficient allowance" },
    ]);
    const steps = bridgeStateToSteps(s);
    expect(steps[0].state).toBe("error");
    expect(s.error).toBe("insufficient allowance");
  });

  it("saveBridgeState / removeBridgeState round-trip", () => {
    const s = seed("tx9");
    saveBridgeState({ ...s, burnTxHash: "0xburn" });
    expect(loadBridgeState("tx9")?.burnTxHash).toBe("0xburn");
    removeBridgeState("tx9");
    expect(loadBridgeState("tx9")).toBeNull();
  });

  it("bridgeStateFromRecord falls back to persisted state", () => {
    seed("tx-rec");
    const record = { id: "tx-rec", type: "bridge" } as any;
    expect(bridgeStateFromRecord(record)?.txId).toBe("tx-rec");
  });
});
