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
  updateBridgeState,
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

describe("bridge-state invariants (Phase 6)", () => {
  it("persisted state survives reload after burn (reload-after-burn)", () => {
    const s = seed("tx-reload-burn");
    const burned = deriveBridgeState("tx-reload-burn", [
      { name: "approve", state: "success", txHash: "0xapprove" },
      { name: "burn", state: "success", txHash: "0xburn" },
    ]);
    // Simulate a page reload: module-level cache is gone, storage is the only source.
    const reloaded = loadBridgeState("tx-reload-burn");
    expect(reloaded?.burnTxHash).toBe("0xburn");
    expect(isBurnConfirmed(reloaded)).toBe(true);
    expect(burned.burnTxHash).toBe("0xburn");
  });

  it("recovery after destination failure keeps the burn confirmed (no re-burn)", () => {
    seed("tx-dst-fail");
    deriveBridgeState("tx-dst-fail", [
      { name: "approve", state: "success", txHash: "0xapprove" },
      { name: "burn", state: "success", txHash: "0xburn" },
      { name: "fetchAttestation", state: "success" },
      { name: "mint", state: "error", message: "destination reverted" },
    ]);
    const retried = deriveBridgeState("tx-dst-fail", [
      { name: "approve", state: "success", txHash: "0xapprove" },
      { name: "burn", state: "success", txHash: "0xburn" },
      { name: "fetchAttestation", state: "success" },
      { name: "mint", state: "error", message: "destination reverted" },
    ]);
    // A duplicate retry must never clear the burn evidence.
    expect(retried.burnTxHash).toBe("0xburn");
    expect(isBurnConfirmed(retried)).toBe(true);
    expect(retried.state).toBe("FAILED");
  });

  it("rejects corrupted localStorage entries (INVARIANT 10)", () => {
    store.set(
      "agfusion_bridge_states_v1",
      JSON.stringify({ "tx-bad": { txId: "tx-bad", junk: true } }),
    );
    expect(loadBridgeState("tx-bad")).toBeNull();
    // The corrupt entry was removed, not silently trusted.
    expect(JSON.parse(store.get("agfusion_bridge_states_v1") || "{}")).toEqual({});
  });

  it("rejects truncated JSON storage", () => {
    store.set("agfusion_bridge_states_v1", "{not valid json");
    expect(loadBridgeState("tx-x")).toBeNull();
  });

  it("rejects entries with unknown chains / bad amounts", () => {
    const base = seed("tx-valid");
    store.set(
      "agfusion_bridge_states_v1",
      JSON.stringify({
        "tx-valid": { ...base, txId: "tx-valid" },
        "tx-unknown-chain": { ...base, txId: "tx-unknown-chain", fromChain: "Sonic_Testnet" },
        "tx-bad-amount": { ...base, txId: "tx-bad-amount", amount: "abc" },
        "tx-zero-amount": { ...base, txId: "tx-zero-amount", amount: "0" },
        "tx-bad-state": { ...base, txId: "tx-bad-state", state: "MADE_UP" },
      }),
    );
    expect(loadBridgeState("tx-unknown-chain")).toBeNull();
    expect(loadBridgeState("tx-bad-amount")).toBeNull();
    expect(loadBridgeState("tx-zero-amount")).toBeNull();
    expect(loadBridgeState("tx-bad-state")).toBeNull();
    // Valid entry still loads.
    expect(loadBridgeState("tx-valid")?.txId).toBe("tx-valid");
  });

  it("never lets recovery change amount / chains / recipient (INVARIANTS 4–7)", () => {
    seed("tx-frozen");
    const updated = updateBridgeState("tx-frozen", {
      amount: "999",
      fromChain: "Base_Sepolia",
      toChain: "Arc_Testnet",
      token: "EURC",
      recipient: "0x000000000000000000000000000000000000dEaD",
      walletType: "circle",
    });
    expect(updated?.amount).toBe("5");
    expect(updated?.fromChain).toBe("Arc_Testnet");
    expect(updated?.toChain).toBe("Base_Sepolia");
    expect(updated?.token).toBe("USDC");
    expect(updated?.recipient).toBeUndefined();
    expect(updated?.walletType).toBe("evm");
  });

  it("a completed bridge can never return to pending (INVARIANT 8)", () => {
    seed("tx-done");
    deriveBridgeState("tx-done", [
      { name: "approve", state: "success", txHash: "0xapprove" },
      { name: "burn", state: "success", txHash: "0xburn" },
      { name: "fetchAttestation", state: "success" },
      { name: "mint", state: "success", txHash: "0xmint" },
    ]);
    // A later error event on an already-completed bridge must not regress it.
    const after = deriveBridgeState("tx-done", [
      { name: "mint", state: "error", message: "late error" },
    ]);
    expect(after.state).toBe("COMPLETED");
    expect(after.destinationTxHash).toBe("0xmint");
  });
});
