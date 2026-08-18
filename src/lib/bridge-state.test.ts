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

const APPROVE = "0x" + "11".repeat(32);
const BURN = "0x" + "22".repeat(32);
const MINT = "0x" + "33".repeat(32);

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
      { name: "approve", state: "success", txHash: APPROVE },
    ]);
    expect(s.state).toBe("APPROVED");
    expect(s.approvalTxHash).toBe(APPROVE);
  });

  it("derives ATTESTATION_PENDING once the burn has a valid hash", () => {
    seed();
    const s = deriveBridgeState("tx1", [
      { name: "approve", state: "success", txHash: APPROVE },
      { name: "burn", state: "success", txHash: BURN },
    ]);
    expect(s.state).toBe("ATTESTATION_PENDING");
    expect(s.burnTxHash).toBe(BURN);
    expect(isBurnConfirmed(s)).toBe(true);
  });

  it("never treats a confirmed burn as re-burnable", () => {
    seed();
    const s = deriveBridgeState("tx1", [
      { name: "burn", state: "success", txHash: BURN },
    ]);
    expect(isBurnConfirmed(s)).toBe(true);
    const failed = deriveBridgeState("tx1", [
      { name: "burn", state: "success", txHash: BURN },
      { name: "fetchAttestation", state: "error", message: "timeout" },
    ]);
    expect(failed.burnTxHash).toBe(BURN);
    expect(failed.state).toBe("FAILED");
    expect(isBurnConfirmed(failed)).toBe(true);
  });

  it("derives COMPLETED when mint succeeds", () => {
    seed();
    const s = deriveBridgeState("tx1", [
      { name: "approve", state: "success", txHash: APPROVE },
      { name: "burn", state: "success", txHash: BURN },
      { name: "fetchAttestation", state: "success" },
      { name: "mint", state: "success", txHash: MINT },
    ]);
    expect(s.state).toBe("COMPLETED");
    expect(s.destinationTxHash).toBe(MINT);
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
    saveBridgeState({ ...s, burnTxHash: BURN });
    expect(loadBridgeState("tx9")?.burnTxHash).toBe(BURN);
    removeBridgeState("tx9");
    expect(loadBridgeState("tx9")).toBeNull();
  });

  it("bridgeStateFromRecord falls back to persisted state", () => {
    seed("tx-rec");
    const record = { id: "tx-rec", type: "bridge" } as any;
    expect(bridgeStateFromRecord(record)?.txId).toBe("tx-rec");
  });
});

describe("bridge-state invariants", () => {
  it("persisted state survives reload after burn", () => {
    const burned = deriveBridgeState("tx-reload-burn", [
      { name: "approve", state: "success", txHash: APPROVE },
      { name: "burn", state: "success", txHash: BURN },
    ]);
    const reloaded = loadBridgeState("tx-reload-burn");
    expect(reloaded?.burnTxHash).toBe(BURN);
    expect(isBurnConfirmed(reloaded)).toBe(true);
    expect(burned.burnTxHash).toBe(BURN);
  });

  it("recovery after destination failure keeps the burn confirmed", () => {
    seed("tx-dst-fail");
    deriveBridgeState("tx-dst-fail", [
      { name: "approve", state: "success", txHash: APPROVE },
      { name: "burn", state: "success", txHash: BURN },
      { name: "fetchAttestation", state: "success" },
      { name: "mint", state: "error", message: "destination reverted" },
    ]);
    const retried = deriveBridgeState("tx-dst-fail", [
      { name: "approve", state: "success", txHash: APPROVE },
      { name: "burn", state: "success", txHash: BURN },
      { name: "fetchAttestation", state: "success" },
      { name: "mint", state: "error", message: "destination reverted" },
    ]);
    expect(retried.burnTxHash).toBe(BURN);
    expect(isBurnConfirmed(retried)).toBe(true);
    expect(retried.state).toBe("FAILED");
  });

  it("rejects corrupted sessionStorage entries", () => {
    store.set(
      "agfusion_bridge_states_v1",
      JSON.stringify({ "tx-bad": { txId: "tx-bad", junk: true } }),
    );
    expect(loadBridgeState("tx-bad")).toBeNull();
    expect(JSON.parse(store.get("agfusion_bridge_states_v1") || "{}")).toEqual({});
  });

  it("rejects truncated JSON storage", () => {
    store.set("agfusion_bridge_states_v1", "{not valid json");
    expect(loadBridgeState("tx-x")).toBeNull();
  });

  it("rejects unknown chains, bad amounts, states, and malformed hashes", () => {
    const base = seed("tx-valid");
    store.set(
      "agfusion_bridge_states_v1",
      JSON.stringify({
        "tx-valid": { ...base, txId: "tx-valid" },
        "tx-unknown-chain": { ...base, txId: "tx-unknown-chain", fromChain: "Sonic_Testnet" },
        "tx-bad-amount": { ...base, txId: "tx-bad-amount", amount: "abc" },
        "tx-zero-amount": { ...base, txId: "tx-zero-amount", amount: "0" },
        "tx-bad-state": { ...base, txId: "tx-bad-state", state: "MADE_UP" },
        "tx-bad-hash": { ...base, txId: "tx-bad-hash", burnTxHash: "0xburn" },
      }),
    );
    expect(loadBridgeState("tx-unknown-chain")).toBeNull();
    expect(loadBridgeState("tx-bad-amount")).toBeNull();
    expect(loadBridgeState("tx-zero-amount")).toBeNull();
    expect(loadBridgeState("tx-bad-state")).toBeNull();
    expect(loadBridgeState("tx-bad-hash")).toBeNull();
    expect(loadBridgeState("tx-valid")?.txId).toBe("tx-valid");
  });

  it("never lets recovery change amount / chains / recipient", () => {
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

  it("a completed bridge can never return to pending", () => {
    seed("tx-done");
    deriveBridgeState("tx-done", [
      { name: "approve", state: "success", txHash: APPROVE },
      { name: "burn", state: "success", txHash: BURN },
      { name: "fetchAttestation", state: "success" },
      { name: "mint", state: "success", txHash: MINT },
    ]);
    const after = deriveBridgeState("tx-done", [
      { name: "mint", state: "error", message: "late error" },
    ]);
    expect(after.state).toBe("COMPLETED");
    expect(after.destinationTxHash).toBe(MINT);
  });

  it("stale lifecycle events cannot regress a confirmed burn", () => {
    seed("tx-stale");
    deriveBridgeState("tx-stale", [
      { name: "approve", state: "success", txHash: APPROVE },
      { name: "burn", state: "success", txHash: BURN },
    ]);
    const stale = deriveBridgeState("tx-stale", [
      { name: "approve", state: "success", txHash: APPROVE },
    ]);
    expect(stale.state).toBe("ATTESTATION_PENDING");
    expect(stale.burnTxHash).toBe(BURN);
  });
});
