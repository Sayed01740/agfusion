/**
 * Persistent per-transaction bridge state machine (Phase 5/6/7).
 *
 * The invariant this module enforces: a confirmed burn is NEVER re-executed.
 * Recovery resumes from the last confirmed state instead of restarting.
 */

import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { CCTP_CHAIN_CONFIG } from "@/lib/cctp-chains";

export type BridgeStateName =
  | "INIT"
  | "APPROVAL_PENDING"
  | "APPROVED"
  | "BURN_PENDING"
  | "BURN_CONFIRMED"
  | "ATTESTATION_PENDING"
  | "ATTESTATION_RECEIVED"
  | "DESTINATION_PENDING"
  | "DESTINATION_CONFIRMED"
  | "COMPLETED"
  | "FAILED"
  | "RECOVERABLE";

export type BridgeWalletType = "evm" | "circle" | "agent";

export interface BridgeState {
  txId: string;
  walletType: BridgeWalletType;
  walletAddress: string | null;
  fromChain: ChainId;
  toChain: ChainId;
  token: string;
  amount: string;
  recipient?: string;
  approvalTxHash?: string;
  burnTxHash?: string;
  attestationData?: unknown;
  destinationTxHash?: string;
  state: BridgeStateName;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "agfusion_bridge_states_v1";

const KNOWN_STATES: BridgeStateName[] = [
  "INIT",
  "APPROVAL_PENDING",
  "APPROVED",
  "BURN_PENDING",
  "BURN_CONFIRMED",
  "ATTESTATION_PENDING",
  "ATTESTATION_RECEIVED",
  "DESTINATION_PENDING",
  "DESTINATION_CONFIRMED",
  "COMPLETED",
  "FAILED",
  "RECOVERABLE",
];

const KNOWN_WALLET_TYPES: BridgeWalletType[] = ["evm", "circle", "agent"];

/**
 * INVARIANT 10: persisted state must be validated before use.
 * Rejects corrupted / tampered / truncated entries (wrong chains, zero or
 * non-numeric amounts, unknown states, missing ids) so recovery never acts
 * on garbage.
 */
export function validateBridgeState(raw: unknown): raw is BridgeState {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as Record<string, unknown>;
  if (typeof s.txId !== "string" || !s.txId) return false;
  if (
    typeof s.walletType !== "string" ||
    !KNOWN_WALLET_TYPES.includes(s.walletType as BridgeWalletType)
  ) {
    return false;
  }
  if (
    typeof s.fromChain !== "string" ||
    typeof s.toChain !== "string" ||
    !CCTP_CHAIN_CONFIG[s.fromChain] ||
    !CCTP_CHAIN_CONFIG[s.toChain]
  ) {
    return false;
  }
  if (typeof s.token !== "string" || !s.token) return false;
  if (typeof s.amount !== "string") return false;
  const amount = Number(s.amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (
    typeof s.state !== "string" ||
    !KNOWN_STATES.includes(s.state as BridgeStateName)
  ) {
    return false;
  }
  if (typeof s.createdAt !== "number" || typeof s.updatedAt !== "number") {
    return false;
  }
  return true;
}

export function loadBridgeState(txId: string): BridgeState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, BridgeState>;
    const entry = map[txId];
    if (!entry) return null;
    // INVARIANT 10: corrupted entries are dropped, never trusted.
    if (!validateBridgeState(entry)) {
      removeBridgeState(txId);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export function saveBridgeState(state: BridgeState): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, BridgeState>) : {};
    map[state.txId] = { ...state, updatedAt: Date.now() };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable */
  }
}

export function removeBridgeState(txId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, BridgeState>;
    delete map[txId];
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function initBridgeState(params: {
  txId: string;
  walletType: BridgeWalletType;
  walletAddress: string | null;
  fromChain: ChainId;
  toChain: ChainId;
  token: string;
  amount: string;
  recipient?: string;
}): BridgeState {
  const state: BridgeState = {
    txId: params.txId,
    walletType: params.walletType,
    walletAddress: params.walletAddress,
    fromChain: params.fromChain,
    toChain: params.toChain,
    token: params.token,
    amount: params.amount,
    recipient: params.recipient,
    state: "INIT",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveBridgeState(state);
  return state;
}

export function updateBridgeState(
  txId: string,
  patch: Partial<BridgeState>,
): BridgeState | null {
  const current = loadBridgeState(txId);
  if (!current) return null;

  // INVARIANTS 4–7: source/destination chain, amount, recipient and token are
  // immutable once a bridge exists. A recovery attempt can never rewrite them,
  // so a "recovered" bridge always moves the same funds to the same place.
  const frozen: Array<keyof BridgeState> = [
    "txId",
    "walletType",
    "walletAddress",
    "fromChain",
    "toChain",
    "amount",
    "token",
    "recipient",
  ];
  const safePatch: Partial<BridgeState> = { ...patch };
  for (const key of frozen) {
    const v = patch[key];
    if (v !== undefined && v !== current[key]) {
      delete safePatch[key];
    }
  }

  const next = { ...current, ...safePatch, updatedAt: Date.now() };
  saveBridgeState(next);
  return next;
}

/**
 * Derive the state machine from SDK step results. Steps arrive in execution
 * order (approve → burn → fetchAttestation → mint). A step is "confirmed" when
 * the SDK reports success with a tx hash; attestation confirmation does not
 * need a hash.
 */
export function deriveBridgeState(
  txId: string,
  steps: Array<{ name?: string; state?: string; txHash?: string; message?: string }>,
  opts?: { error?: string },
): BridgeState {
  const existing = loadBridgeState(txId);
  if (!existing) return initBridgeState({ txId, walletType: "evm", walletAddress: null, fromChain: "Arc_Testnet", toChain: "Base_Sepolia", token: "USDC", amount: "0" });

  // INVARIANT 8: a completed bridge is terminal. Late/duplicate step events
  // (e.g. a delayed error from a previous attempt) must never regress it.
  if (existing.state === "COMPLETED") {
    const terminal: BridgeState = { ...existing, updatedAt: Date.now() };
    saveBridgeState(terminal);
    return terminal;
  }

  const stepState = (name: string): string | undefined =>
    steps.find((s) => s.name === name)?.state;

  const approveOk = stepState("approve") === "success";
  const burnOk = stepState("burn") === "success";
  const attestOk = stepState("fetchAttestation") === "success";
  const mintOk = stepState("mint") === "success" || stepState("mint") === "noop";

  const approvalTxHash = existing.approvalTxHash ?? steps.find((s) => s.name === "approve")?.txHash;
  const burnTxHash = existing.burnTxHash ?? steps.find((s) => s.name === "burn")?.txHash;
  const destinationTxHash = existing.destinationTxHash ?? steps.find((s) => s.name === "mint")?.txHash;

  let state: BridgeStateName = existing.state;
  const anyError = steps.some((s) => s.state === "error");
  if (mintOk) state = "COMPLETED";
  else if (anyError) state = "FAILED";
  else if (burnOk && attestOk) state = "DESTINATION_PENDING";
  else if (burnOk) state = "ATTESTATION_PENDING";
  else if (burnTxHash) state = "BURN_CONFIRMED";
  else if (approveOk) state = "APPROVED";
  else if (stepState("approve") === "active" || stepState("approve") === "pending") state = "APPROVAL_PENDING";
  else state = "RECOVERABLE";

  const errStep = steps.find((s) => s.state === "error");
  const next: BridgeState = {
    ...existing,
    state,
    approvalTxHash,
    burnTxHash,
    destinationTxHash,
    error: opts?.error ?? ((errStep as { message?: string } | undefined)?.message as string | undefined),
    updatedAt: Date.now(),
  };
  saveBridgeState(next);
  return next;
}

/**
 * Convert a persisted bridge state into UI steps, preserving hashes so the
 * stepper shows real transaction links after reload.
 */
export function bridgeStateToSteps(state: BridgeState | null): TxStep[] {
  if (!state) return [];
  const mk = (name: string, s: "pending" | "active" | "success" | "error", txHash?: string): TxStep => ({ name, state: s, txHash });

  const inState = (names: BridgeStateName[]) => names.includes(state.state);

const done = state.state === "COMPLETED";

  // In FAILED/RECOVERABLE states, highlight the step where progress stopped.
  const failed = state.state === "FAILED" || state.state === "RECOVERABLE";
  const failApprove = failed && !state.approvalTxHash && !done;
  const failBurn = failed && state.approvalTxHash && !state.burnTxHash && !done;
  const failAttest = failed && state.burnTxHash && !state.destinationTxHash && !done && state.state === "FAILED";
  const failMint = failed && state.destinationTxHash && !done;

  const approveStep: TxStep = state.approvalTxHash || done
    ? mk("Approval", "success", state.approvalTxHash)
    : mk("Approval", failApprove ? "error" : inState(["APPROVAL_PENDING", "APPROVED", "FAILED", "RECOVERABLE"]) ? "active" : "pending");

  const burnStep: TxStep = state.burnTxHash || done
    ? mk("Burn", "success", state.burnTxHash)
    : mk("Burn", failBurn ? "error" : inState(["BURN_PENDING", "BURN_CONFIRMED", "ATTESTATION_PENDING", "ATTESTATION_RECEIVED", "DESTINATION_PENDING", "DESTINATION_CONFIRMED", "FAILED", "RECOVERABLE"]) ? "active" : "pending");

  const attestStep: TxStep = mk(
    "Attestation",
    done || inState(["ATTESTATION_RECEIVED", "DESTINATION_PENDING", "DESTINATION_CONFIRMED"]) ? "success" : failAttest ? "error" : inState(["ATTESTATION_PENDING", "RECOVERABLE"]) ? "active" : "pending",
  );

  const mintStep: TxStep = state.destinationTxHash || done
    ? mk("Destination Mint", "success", state.destinationTxHash)
    : mk("Destination Mint", failMint ? "error" : inState(["DESTINATION_PENDING", "DESTINATION_CONFIRMED"]) ? "active" : "pending");

  return [approveStep, burnStep, attestStep, mintStep];
}

/** True when the persisted state proves the burn already happened. */
export function isBurnConfirmed(state: BridgeState | null): boolean {
  if (!state) return false;
  if (state.burnTxHash) return true;
  return ["BURN_CONFIRMED", "ATTESTATION_PENDING", "ATTESTATION_RECEIVED", "DESTINATION_PENDING", "DESTINATION_CONFIRMED", "COMPLETED"].includes(state.state);
}

export function bridgeStateFromRecord(tx: TransactionRecord | undefined | null): BridgeState | null {
  if (!tx) return null;
  return (tx as TransactionRecord & { bridgeState?: BridgeState }).bridgeState ?? loadBridgeState(tx.id);
}
