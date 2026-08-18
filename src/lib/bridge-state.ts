/**
 * Persistent per-transaction bridge state machine.
 *
 * Invariants:
 * - a confirmed burn is NEVER re-executed during recovery
 * - source/destination/amount/token/recipient are immutable for a tx
 * - persisted state is validated before use
 * - stale lifecycle events cannot move a bridge backwards
 * - a completed bridge is terminal
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

const STATE_RANK: Record<BridgeStateName, number> = {
  INIT: 0,
  APPROVAL_PENDING: 1,
  APPROVED: 2,
  BURN_PENDING: 3,
  BURN_CONFIRMED: 4,
  ATTESTATION_PENDING: 5,
  ATTESTATION_RECEIVED: 6,
  DESTINATION_PENDING: 7,
  DESTINATION_CONFIRMED: 8,
  COMPLETED: 9,
  FAILED: -1,
  RECOVERABLE: -1,
};

const isValidHash = (value: unknown): value is string =>
  typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);

/** Validate persisted state before recovery ever trusts it. */
export function validateBridgeState(raw: unknown): raw is BridgeState {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as Record<string, unknown>;
  if (typeof s.txId !== "string" || !s.txId) return false;
  if (
    typeof s.walletType !== "string" ||
    !KNOWN_WALLET_TYPES.includes(s.walletType as BridgeWalletType)
  ) return false;
  if (
    typeof s.fromChain !== "string" ||
    typeof s.toChain !== "string" ||
    !CCTP_CHAIN_CONFIG[s.fromChain] ||
    !CCTP_CHAIN_CONFIG[s.toChain]
  ) return false;
  if (typeof s.token !== "string" || !s.token) return false;
  if (typeof s.amount !== "string") return false;
  const amount = Number(s.amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (
    typeof s.state !== "string" ||
    !KNOWN_STATES.includes(s.state as BridgeStateName)
  ) return false;
  if (typeof s.createdAt !== "number" || typeof s.updatedAt !== "number") return false;

  for (const key of ["approvalTxHash", "burnTxHash", "destinationTxHash"] as const) {
    if (s[key] !== undefined && !isValidHash(s[key])) return false;
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
    if (v !== undefined && v !== current[key]) delete safePatch[key];
  }

  const next = { ...current, ...safePatch, updatedAt: Date.now() };
  saveBridgeState(next);
  return next;
}

/**
 * Derive state from SDK step results. Stale/partial events cannot regress a
 * bridge that has already reached a later non-terminal state. FAILED and
 * RECOVERABLE remain resumable and may advance when a subsequent attempt
 * supplies stronger evidence.
 */
export function deriveBridgeState(
  txId: string,
  steps: Array<{ name?: string; state?: string; txHash?: string; message?: string }>,
  opts?: { error?: string },
): BridgeState {
  const existing = loadBridgeState(txId);
  if (!existing) {
    return initBridgeState({
      txId,
      walletType: "evm",
      walletAddress: null,
      fromChain: "Arc_Testnet",
      toChain: "Base_Sepolia",
      token: "USDC",
      amount: "0",
    });
  }

  if (existing.state === "COMPLETED") {
    const terminal = { ...existing, updatedAt: Date.now() };
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

  let derived: BridgeStateName = existing.state;
  const anyError = steps.some((s) => s.state === "error");
  if (mintOk) derived = "COMPLETED";
  else if (anyError) derived = "FAILED";
  else if (burnOk && attestOk) derived = "DESTINATION_PENDING";
  else if (burnOk) derived = "ATTESTATION_PENDING";
  else if (burnTxHash) derived = "BURN_CONFIRMED";
  else if (approveOk) derived = "APPROVED";
  else if (stepState("approve") === "active" || stepState("approve") === "pending") derived = "APPROVAL_PENDING";
  else derived = "RECOVERABLE";

  // Never let a stale lifecycle event erase stronger evidence already persisted.
  if (
    STATE_RANK[existing.state] >= 0 &&
    STATE_RANK[derived] >= 0 &&
    STATE_RANK[derived] < STATE_RANK[existing.state]
  ) {
    derived = existing.state;
  }

  const errStep = steps.find((s) => s.state === "error");
  const next: BridgeState = {
    ...existing,
    state: derived,
    approvalTxHash,
    burnTxHash,
    destinationTxHash,
    error: opts?.error ?? errStep?.message,
    updatedAt: Date.now(),
  };
  saveBridgeState(next);
  return next;
}

export function bridgeStateToSteps(state: BridgeState | null): TxStep[] {
  if (!state) return [];
  const mk = (name: string, s: "pending" | "active" | "success" | "error", txHash?: string): TxStep => ({ name, state: s, txHash });
  const inState = (names: BridgeStateName[]) => names.includes(state.state);
  const done = state.state === "COMPLETED";
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

export function isBurnConfirmed(state: BridgeState | null): boolean {
  if (!state) return false;
  if (state.burnTxHash) return true;
  return [
    "BURN_CONFIRMED",
    "ATTESTATION_PENDING",
    "ATTESTATION_RECEIVED",
    "DESTINATION_PENDING",
    "DESTINATION_CONFIRMED",
    "COMPLETED",
  ].includes(state.state);
}

export function bridgeStateFromRecord(tx: TransactionRecord | undefined | null): BridgeState | null {
  if (!tx) return null;
  return (tx as TransactionRecord & { bridgeState?: BridgeState }).bridgeState ?? loadBridgeState(tx.id);
}
