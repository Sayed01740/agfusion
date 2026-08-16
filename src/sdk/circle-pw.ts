import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import { type Address } from "viem";
import { CIRCLE_BRIDGE_CHAINS } from "@/lib/cctp-chains";
import { cctpConfigByChainId } from "@/lib/cctp-chains";

let circleSdk: W3SSdk | null = null;

export type CircleWallet = {
  id: string;
  address: string;
  blockchain: string;
  accountType?: string;
};

/** Session data persisted to sessionStorage so a reload can restore the wallet.
 * Persisted fields are the user's own session material (userToken + client-side
 * encryption key per Circle's Web SDK model) and wallet metadata — never the
 * server API key. */
export type CircleSession = {
  userToken: string;
  /** Client-side encryption key from the Circle Web SDK (non-secret, per the SDK model) */
  encryptionKey?: string;
  /** Email used to derive the Circle user, so the session can be re-authed on restore */
  email?: string;
  wallets: CircleWallet[];
  preparedAt: number;
  /** Blockchains this Circle wallet can execute on (currently Arc + Base). */
  supportedBlockchains: string[];
};

const SESSION_KEY = "agfusion_circle_session_v1";
const WALLET_META_KEY = "agfusion_circle_wallet_meta_v1";

let circleSession: CircleSession | null = null;

// ---------------------------------------------------------------------------
// Session persistence (Phase 4)
// ---------------------------------------------------------------------------

export function saveCircleSession(session: CircleSession): void {
  circleSession = session;
  if (typeof window === "undefined") return;
  try {
    // userToken + encryptionKey are the user's own session material that the
    // Circle Web SDK already holds in the browser — not the server API key.
    // Persisting them lets the session survive reload for challenge re-approval.
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window.sessionStorage.setItem(
      WALLET_META_KEY,
      JSON.stringify({
        name: "Circle Email Wallet",
        uuid: "circle-pw",
        wallets: session.wallets,
        supportedBlockchains: session.supportedBlockchains,
      }),
    );
  } catch {
    /* storage unavailable */
  }
}

export function loadCircleSession(): CircleSession | null {
  if (circleSession) return circleSession;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CircleSession;
    if (!parsed?.userToken || !Array.isArray(parsed?.wallets)) return null;
    circleSession = parsed;
    return circleSession;
  } catch {
    return null;
  }
}

export function clearCircleSession(): void {
  circleSession = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(WALLET_META_KEY);
  } catch {
    /* ignore */
  }
}

export function getCircleSession(): CircleSession | null {
  return circleSession ?? loadCircleSession();
}

export async function getCircleSdk(): Promise<W3SSdk> {
  if (circleSdk) return circleSdk;

  circleSdk = new W3SSdk();
  const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID?.trim();
  if (appId) {
    circleSdk.setAppSettings({ appId });
  }
  return circleSdk;
}

async function listWallets(userToken: string): Promise<CircleWallet[]> {
  const response = await fetch("/api/circle/pw/wallets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userToken }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to fetch Circle wallets");
  return (data.wallets || []).filter(
    (wallet: CircleWallet) => wallet.id && wallet.address && wallet.blockchain,
  );
}

async function executeChallenge(challengeId: string): Promise<void> {
  const sdk = await getCircleSdk();
  await new Promise<void>((resolve, reject) => {
    sdk.execute(challengeId, (error) => {
      if (error) reject(new Error(error.message || "Circle approval was cancelled."));
      else resolve();
    });
  });
}

export async function authenticateWithCircleEmail(
  email: string,
): Promise<{ address: string; wallets: CircleWallet[] }> {
  const sdk = await getCircleSdk();

  // 1. Fetch userToken and encryptionKey from our backend
  const res = await fetch("/api/circle/pw/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to authenticate with Circle");
  }

  // 2. Set authentication in the SDK
  sdk.setAuthentication({
    userToken: data.userToken,
    encryptionKey: data.encryptionKey,
  });

  // 3. Check if user already has a wallet
  let wallets = await listWallets(data.userToken);
  const wanted = CIRCLE_BRIDGE_CHAINS.map(
    (c) => cctpConfigByChainId(c === "Arc_Testnet" ? 5042002 : 84532)?.circleBlockchain,
  ).filter(Boolean) as string[];

  if (!wanted.every((bc) => wallets.some((w) => w.blockchain === bc))) {
    const challengeRes = await fetch("/api/circle/pw/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userToken: data.userToken,
        blockchains: wanted,
      }),
    });
    const challengeData = await challengeRes.json();
    if (!challengeRes.ok) throw new Error(challengeData.error || "Failed to prepare Circle wallet.");
    await executeChallenge(challengeData.challengeId);
    wallets = await listWallets(data.userToken);
  }

  const arcWallet = wallets.find((wallet) => wallet.blockchain === "ARC-TESTNET");
  if (!arcWallet) throw new Error("Circle did not return an Arc Testnet wallet after approval.");

  saveCircleSession({
    userToken: data.userToken,
    encryptionKey: data.encryptionKey || undefined,
    email,
    wallets,
    preparedAt: Date.now(),
    supportedBlockchains: wanted,
  });
  return { address: arcWallet.address, wallets };
}

// ---------------------------------------------------------------------------
// Mock EIP-1193 provider (Phase 4) — factory so the provider can be rebuilt
// after reload instead of living only inside the wallet modal closure.
// ---------------------------------------------------------------------------

/** Hex chainId → Circle Programmable Wallets blockchain, limited to what Circle PW can execute. */
function circleBlockchainForChainId(chainId: number): string | null {
  if (chainId === 5042002) return "ARC-TESTNET";
  if (chainId === 84532) return "BASE-SEPOLIA";
  return null;
}

/** Hex chainId → /api/rpc proxy key for read-only forwarding. */
function rpcProxyKeyForChainId(chainId: number): string {
  return cctpConfigByChainId(chainId)?.rpcProxyKey ?? "arc";
}

/** Only chains Circle Programmable Wallets can actually execute on today. */
const CIRCLE_SUPPORTED_CHAIN_IDS = new Set<number>([5042002, 84532]);

/**
 * Forward a JSON-RPC call to the server-side /api/rpc proxy (real upstreams
 * with failover). Never fabricates a blockchain response: on failure this
 * throws so callers fail safely instead of trusting a made-up value.
 */
async function forwardRpcToProxy(
  chainId: number,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const chainKey = rpcProxyKeyForChainId(chainId);
  const res = await fetch(`/api/rpc?chain=${chainKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as {
    result?: unknown;
    error?: { code?: number; message?: string } | null;
  } | null;
  if (!res.ok || !data || data.error) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(
      `Circle wallet RPC ${method} failed (${chainKey}): ${msg}`,
    );
  }
  return data.result;
}

/**
 * Build the minimal EIP-1193 provider that stands in for the Circle
 * user-controlled wallet. Created once per session and re-created after reload
 * from persisted session data.
 */
export function createCircleMockProvider(options: {
  address: string;
  chainIdRef: { value: string };
  /** Optional session getter; defaults to the module session. */
  session?: () => CircleSession | null;
}): {
  provider: {
    request: (args: any) => Promise<unknown>;
    on: () => void;
    removeListener: () => void;
  };
  getChainIdHex: () => string;
} {
  const { address, chainIdRef, session } = options;
  const sessionGetter = session ?? (() => getCircleSession());

  const provider = {
    request: async (args: any) => {
      switch (args.method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return [address];
        case "eth_chainId":
          return chainIdRef.value;
        case "wallet_switchEthereumChain": {
          const target = args.params?.[0]?.chainId;
          const chainId = target ? Number.parseInt(String(target), 16) : NaN;
          // Only Circle-supported chains may be selected — everything else must
          // fail explicitly so the app never believes the wallet is on a chain
          // the Circle wallet cannot execute on.
          if (!Number.isFinite(chainId) || !CIRCLE_SUPPORTED_CHAIN_IDS.has(chainId)) {
            throw new Error(
              `Circle Email Wallet cannot switch to chain ${target ?? "unknown"}. ` +
                "Supported: Arc Testnet (5042002) and Base Sepolia (84532).",
            );
          }
          const blockchain = circleBlockchainForChainId(chainId);
          const session = sessionGetter();
          const walletExists = session?.wallets?.some(
            (w) => w.blockchain === blockchain,
          );
          if (!walletExists) {
            throw new Error(
              `No Circle ${blockchain} wallet found. Reconnect your Circle Email Wallet to create one.`,
            );
          }
          chainIdRef.value = `0x${chainId.toString(16)}`.toLowerCase();
          return null;
        }
        case "wallet_addEthereumChain":
          // Circle PW is a hosted user-controlled wallet — it cannot store new
          // networks. Failing explicitly is safer than pretending success.
          throw new Error(
            "Circle Email Wallet cannot add networks. Only Arc Testnet and Base Sepolia are supported.",
          );
        case "personal_sign":
        case "eth_sign":
          // A Circle user-controlled wallet must never hand out a signature
          // fabricated from public data. The Circle SDK signs server-side via
          // challenges; arbitrary message signing is not supported by this app.
          throw new Error(
            "personal_sign is not supported for Circle Email Wallet. Circle transactions are approved through the Circle PIN/security challenge instead.",
          );
        case "eth_sendTransaction": {
          const tx = args.params?.[0];
          if (!tx?.to || !tx?.data) {
            throw new Error("Circle wallet received an incomplete transaction request.");
          }
          const chainId = Number.parseInt(chainIdRef.value, 16);
          const { executeCircleContractTransaction } = await import("@/sdk/circle-pw");
          const result = await executeCircleContractTransaction({
            chainId,
            to: tx.to,
            data: tx.data,
            value: tx.value,
          });
          // EIP-1193 eth_sendTransaction must return the raw tx hash string.
          return result.txHash;
        }
        // Gas / fee / simulation methods must reflect the real chain — Circle's
        // backend resolves actual fees at execution time. Forward to the RPC
        // proxy; on failure throw instead of returning fabricated values that
        // could influence a real transaction.
        case "eth_estimateGas": {
          const chainId = Number.parseInt(chainIdRef.value, 16);
          const tx = args.params?.[0] || {};
          return forwardRpcToProxy(chainId, "eth_estimateGas", [
            { ...tx, from: tx.from ?? address },
            ...(Array.isArray(args.params) ? args.params.slice(1) : []),
          ]);
        }
        case "eth_call": {
          const chainId = Number.parseInt(chainIdRef.value, 16);
          const tx = args.params?.[0] || {};
          return forwardRpcToProxy(chainId, "eth_call", [
            { ...tx, from: tx.from ?? address },
            ...(Array.isArray(args.params) ? args.params.slice(1) : []),
          ]);
        }
        case "eth_gasPrice":
          return forwardRpcToProxy(
            Number.parseInt(chainIdRef.value, 16),
            "eth_gasPrice",
            [],
          );
        case "eth_maxPriorityFeePerGas":
          return forwardRpcToProxy(
            Number.parseInt(chainIdRef.value, 16),
            "eth_maxPriorityFeePerGas",
            [],
          );
        case "eth_blockNumber":
        case "net_version":
        case "eth_syncing":
          return forwardRpcToProxy(
            Number.parseInt(chainIdRef.value, 16),
            args.method,
            args.params || [],
          );
        default: {
          // Forward all remaining JSON-RPC methods to the server proxy. A
          // failed authoritative read must throw — never silently return null.
          return forwardRpcToProxy(
            Number.parseInt(chainIdRef.value, 16),
            args.method,
            args.params || [],
          );
        }
      }
    },
    on: () => {},
    removeListener: () => {},
  };

  return { provider, getChainIdHex: () => chainIdRef.value };
}

/**
 * Restore a persisted Circle session into SDK + mock-provider state after reload.
 * Returns null when no session (or wallet) can be restored.
 */
export async function restoreCircleSession(): Promise<{
  address: string;
  wallets: CircleWallet[];
  provider: ReturnType<typeof createCircleMockProvider>["provider"];
} | null> {
  const session = loadCircleSession();
  if (!session) return null;
  const arcWallet = session.wallets.find((w) => w.blockchain === "ARC-TESTNET");
  if (!arcWallet) return null;

  const sdk = await getCircleSdk();

  // Best-effort refresh of the userToken via the user's email (fresh
  // userToken + encryptionKey), so challenge signing keeps working after
  // reload. Falls back to the persisted token if the refresh fails.
  let userToken = session.userToken;
  let encryptionKey = session.encryptionKey || "";
  if (session.email) {
    try {
      const res = await fetch("/api/circle/pw/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: session.email }),
      });
      const data = await res.json();
      if (res.ok && data.userToken) {
        userToken = data.userToken;
        encryptionKey = data.encryptionKey || encryptionKey;
        saveCircleSession({ ...session, userToken, encryptionKey });
      }
    } catch {
      /* keep persisted token */
    }
  }

  sdk.setAuthentication({ userToken, encryptionKey });

  const chainIdRef = { value: "0x4cef52" };
  const { provider } = createCircleMockProvider({
    address: arcWallet.address,
    chainIdRef,
  });

  return { address: arcWallet.address, wallets: session.wallets, provider };
}

// ---------------------------------------------------------------------------
// Contract execution (Phase 3) — exact challenge/tx matching, no loose
// createDate window.
// ---------------------------------------------------------------------------

export async function executeCircleContractTransaction(params: {
  chainId: number;
  to: string;
  data: string;
  value?: string;
}): Promise<{ txHash: string; challengeId: string; walletId: string }> {
  const session = getCircleSession();
  if (!session) throw new Error("Circle wallet session expired. Reconnect your Circle Email Wallet.");

  const blockchain = circleBlockchainForChainId(params.chainId);
  if (!blockchain) {
    throw new Error(
      `Circle Email Wallet can only execute on ${session.supportedBlockchains.join(", ")}. ` +
        `Chain ${params.chainId} is not supported by the Circle wallet.`,
    );
  }
  const wallet = session.wallets.find((item) => item.blockchain === blockchain);
  if (!wallet) {
    throw new Error(`Create or reconnect a Circle ${blockchain} wallet before bridging.`);
  }

  const preparedAt = Date.now();
  const response = await fetch("/api/circle/pw/contract-execution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userToken: session.userToken,
      walletId: wallet.id,
      contractAddress: params.to,
      callData: params.data,
      value: params.value,
      // Server binds the wallet's blockchain to the requested chain and
      // rejects cross-user walletId + cross-chain calls (Phase 3).
      chainId: params.chainId,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.challengeId) {
    throw new Error(result.error || "Circle could not prepare this bridge step.");
  }
  const challengeId: string = result.challengeId;
  await executeChallenge(challengeId);

  // Match the exact challenge being executed — never the first tx in a time window.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const transactions = await fetch("/api/circle/pw/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userToken: session.userToken,
        walletId: wallet.id,
        challengeId,
        since: preparedAt,
      }),
    });
    const data = await transactions.json();
    if (transactions.ok && data.txHash) {
      return { txHash: data.txHash, challengeId, walletId: wallet.id };
    }
    // Challenge was rejected/errored server-side — stop early.
    if (data?.challengeStatus === "failed" || data?.error === "challenge_failed") {
      throw new Error(data.message || "Circle transaction failed.");
    }
  }
  throw new Error(
    "Circle approved the transaction but has not returned its hash yet. Check the Circle wallet activity and retry after a moment.",
  );
}

export type { Address };
