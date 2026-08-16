/**
 * Safety verification for the bridge state machine (Phase 5/6):
 * recovery must never re-execute a confirmed burn.
 */
import {
  deriveBridgeState,
  isBurnConfirmed,
  bridgeStateToSteps,
  saveBridgeState,
  loadBridgeState,
  removeBridgeState,
  initBridgeState,
} from "../src/lib/bridge-state";

// Minimal sessionStorage stub so persistence round-trips work in Node.
const store = new Map<string, string>();
(globalThis as any).window = {
  sessionStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (!cond) {
    failures += 1;
    console.error(`✗ FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

function seed(txId: string) {
  removeBridgeState(txId);
  initBridgeState({
    txId,
    walletType: "evm",
    walletAddress: "0xabc",
    fromChain: "Arc_Testnet",
    toChain: "Base_Sepolia",
    token: "USDC",
    amount: "10",
  });
}

// 1. Burn confirmed ⇒ isBurnConfirmed true, hash persisted.
seed("tx_burn_ok");
let s = deriveBridgeState("tx_burn_ok", [
  { name: "approve", state: "success", txHash: "0xapp" },
  { name: "burn", state: "success", txHash: "0xburn" },
]);
check("burn success ⇒ BURN_CONFIRMED+", isBurnConfirmed(s), JSON.stringify(s));
check("burn txHash persisted", s.burnTxHash === "0xburn");
check("burn-only ⇒ ATTESTATION_PENDING", s.state === "ATTESTATION_PENDING", s.state);
check("seed amount preserved", s.amount === "10", s.amount);

// 2. Attestation received ⇒ continue to destination, no re-burn implied.
let s2 = deriveBridgeState("tx_burn_ok", [
  { name: "approve", state: "success", txHash: "0xapp" },
  { name: "burn", state: "success", txHash: "0xburn" },
  { name: "fetchAttestation", state: "success" },
]);
check("attestation ⇒ DESTINATION_PENDING", s2.state === "DESTINATION_PENDING", s2.state);

// 3. Full completion.
let s3 = deriveBridgeState("tx_burn_ok", [
  { name: "approve", state: "success", txHash: "0xapp" },
  { name: "burn", state: "success", txHash: "0xburn" },
  { name: "fetchAttestation", state: "success" },
  { name: "mint", state: "success", txHash: "0xmint" },
]);
check("mint ⇒ COMPLETED", s3.state === "COMPLETED", s3.state);

// 4. State says burn happened but no hash persisted ⇒ still protected.
seed("tx_nohash");
let s4 = deriveBridgeState("tx_nohash", [
  { name: "approve", state: "success", txHash: "0xapp" },
  { name: "burn", state: "success" },
]);
check("burn without hash ⇒ isBurnConfirmed (state-based)", isBurnConfirmed(s4), JSON.stringify(s4));

// 5. Failed mid-attestation ⇒ FAILED, burn still confirmed (fresh tx).
seed("tx_attest_err");
let s5 = deriveBridgeState("tx_attest_err", [
  { name: "approve", state: "success", txHash: "0xapp" },
  { name: "burn", state: "success", txHash: "0xburn" },
  { name: "fetchAttestation", state: "error", message: "timeout" },
]);
check("attestation error ⇒ FAILED", s5.state === "FAILED", s5.state);
check("FAILED still has burnTxHash", s5.burnTxHash === "0xburn");

// 6. UI steps reflect the real progress and hashes.
const steps = bridgeStateToSteps(s5);
check("UI shows 4 steps", steps.length === 4);
check("burn step is success with hash", steps[1].state === "success" && steps[1].txHash === "0xburn");
check("attestation step is error", steps[2].state === "error");

// 7. Persistence round-trip (survives reload).
const loaded = loadBridgeState("tx_attest_err");
check("state survives reload", loaded?.burnTxHash === "0xburn" && loaded.state === "FAILED");

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
