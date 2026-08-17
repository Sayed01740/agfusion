import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import { type Address } from "viem";
import { CIRCLE_BRIDGE_CHAINS } from "@/lib/cctp-chains";
import { cctpConfigByChainId } from "@/lib/cctp-chains";

let circleSdk: W3SSdk | null = null;
let circleSdkAppId: string | null = null;

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
  circleSdk = null;
  circleSdkAppId = null;
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

/**
 * Create the Circle Web SDK exactly as Circle's current Web SDK contract
 * expects: the application id is required and authentication is installed on
 * the SDK before challenge execution. A previous SDK instance is discarded
 * when a network error occurs so a stale SDK/device state cannot poison the
 * next challenge.
 */
export async function getCircleSdk(): Promise<W3SSdk> {
  const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID?.trim();
  if (!appId) {
    throw new Error(
      "Circle Email Wallet is not configured: NEXT_PUBLIC_CIRCLE_APP_ID is missing from the production client environment.",
    );
  }

  if (circleSdk && circleSdkAppId === appId) {
    const session = getCircleSession();
    if (session?.userToken && session.encryptionKey) {
      circleSdk.setAuthentication({
        userToken: session.userToken,
        encryptionKey: session.encryptionKey,
      });
    }
    return circleSdk;
  }

  circleSdk = new W3SSdk({
    configs: {
      appSettings: { appId },
    },
  });
  circleSdkAppId = appId;

  const session = getCircleSession();
  if (session?.userToken && session.encryptionKey) {
    circleSdk.setAuthentication({
      userToken: session.userToken,
      encryptionKey: session.encryptionKey,
    });
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
  const executeOnce = async () => {
    const sdk = await getCircleSdk();
    const session = getCircleSession();
    if (session?.userToken && session.encryptionKey) {
      sdk.setAuthentication({
        userToken: session.userToken,
        encryptionKey: session.encryptionKey,
      });
    }
    await new Promise<void>((resolve, reject) => {
      sdk.execute(challengeId, (error) => {
        if (error) {
          const code = Number((error as any)?.code ?? -1);
          const message = String((error as any)?.message || "Circle challenge failed.");
          const wrapped = new Error(message);
          (wrapped as any).code = code;
          reject(wrapped);
        } else {
          resolve();
        }
      });
    });
  };

  try {
    await executeOnce();
  } catch (error) {
    const code = Number((error as any)?.code ?? -1);
    const message = String((error as any)?.message || error || "");
    // Circle documents 155706 as the Web SDK network error. Recreate the SDK
    // once and retry the SAME challenge. We never create another blockchain
    // transaction challenge, so this cannot duplicate a burn.
    if (code === 155706 || /network connection failed|network error|failed to fetch/i.test(message)) {
      circleSdk = null;
      circleSdkAppId = null;
      try {
        await executeOnce();
        return;
      } catch (retryError) {
        const retryCode = Number((retryError as any)?.code ?? -1);
        const retryMessage = String(
          (retryError as any)?.message || retryError || "Circle challenge failed.",
        );
        const finalError = new Error(
          `Circle Web SDK challenge failed${retryCode > 0 ? ` (${retryCode})` : ""}: ${retryMessage}`,
        );
        (finalError as any).code = retryCode;
        throw finalError;
      }
    }
    throw error;
  }
}

export async function authenticateWithCircleEmail(
  email: string,
): Promise<{ address: string; wallets: CircleWallet[] }> {
  const sdk = await getCircleSdk();

  const res = await fetch("/api/circle/pw/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to authenticate with Circle");
  }

  sdk.setAuthentication({
    userToken: data.userToken,
    encryptionKey: data.encryptionKey,
  });

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
// Mock EIP-1193 provider (Phase 4)
// ---------------------------------------------------------------------------

function circleBlockchainForChainId(chainId: number): string | null {
  if (chainId === 5042002) return "ARC-TESTNET";
  if (chainId === 84532) return "BASE-SEPOLIA";
  return null;
}

function rpcProxyKeyForChainId(chainId: number): string {
  return cctpConfigByChainId(chainId)?.rpcProxyKey ?? "arc";
}

const CIRCLE_SUPPORTED_CHAIN_IDS = new Set<number>([5042002, 84532]);

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
    throw new Error(`Circle wallet RPC ${method} failed (${chainKey}): ${msg}`);
  }
  return data.result;
}

export function createCircleMockProvider(options: {
  address: string;
  chainIdRef: { value: string };
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
          if (!Number.isFinite(chainId) || !CIRCLE_SUPPORTED_CHAIN_IDS.has(chainId)) {
            throw new Error(
              `Circle Email Wallet cannot switch to chain ${target ?? "unknown"}. Supported: Arc Testnet (5042002) and Base Sepolia (84532).`,
            );
          }
          const blockchain = circleBlockchainForChainId(chainId);
          const session = sessionGetter();
          const walletExists = session?.wallets?.some((w) => w.blockchain === blockchain);
          if (!walletExists) {
            throw new Error(`No Circle ${blockchain} wallet found. Reconnect your Circle Email Wallet to create one.`);
          }
          chainIdRef.value = `0x${chainId.toString(16)}`.toLowerCase();
          return null;
        }
        case "wallet_addEthereumChain":
          throw new Error("Circle Email Wallet cannot add networks. Only Arc Testnet and Base Sepolia are supported.");
        case "personal_sign":
        case "eth_sign":
          throw new Error("personal_sign is not supported for Circle Email Wallet. Circle transactions are approved through the Circle PIN/security challenge instead.");
        case "eth_sendTransaction": {
          const tx = args.params?.[0];
          if (!tx?.to || !tx?.data) throw new Error("Circle wallet received an incomplete transaction request.");
          const chainId = Number.parseInt(chainIdRef.value, 16);
          const { executeCircleContractTransaction } = await import("@/sdk/circle-pw");
          const result = await executeCircleContractTransaction({
            chainId,
            to: tx.to,
            data: tx.data,
            value: tx.value,
          });
          return result.txHash;
        }
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
          return forwardRpcToProxy(Number.parseInt(chainIdRef.value, 16), "eth_gasPrice", []);
        case "eth_maxPriorityFeePerGas":
          return forwardRpcToProxy(Number.parseInt(chainIdRef.value, 16), "eth_maxPriorityFeePerGas", []);
        case "eth_blockNumber":
        case "net_version":
        case "eth_syncing":
          return forwardRpcToProxy(Number.parseInt(chainIdRef.value, 16), args.method, args.params || []);
        default:
          return forwardRpcToProxy(Number.parseInt(chainIdRef.value, 16), args.method, args.params || []);
      }
    },
    on: () => {},
    removeListener: () => {},
  };

  return { provider, getChainIdHex: () => chainIdRef.value };
}

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
// Contract execution (Phase 3) — exact challenge/tx matching
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
      `Circle Email Wallet can only execute on ${session.supportedBlockchains.join(", ")}. Chain ${params.chainId} is not supported by the Circle wallet.`,
    );
  }
  const wallet = session.wallets.find((item) => item.blockchain === blockchain);
  if (!wallet) throw new Error(`Create or reconnect a Circle ${blockchain} wallet before bridging.`);

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
      chainId: params.chainId,
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.challengeId) {
    throw new Error(result?.error || "Circle could not prepare this bridge step.");
  }
  const challengeId = String(result.challengeId);
  await executeChallenge(challengeId);

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const transactions = await fetch("/api/circle/pw/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userToken: session.userToken,
        walletId: wallet.id,
        challengeId,
        since: preparedAt,
      }),
      cache: "no-store",
    });
    const data = await transactions.json().catch(() => null);
    if (transactions.ok && data?.txHash) {
      return { txHash: String(data.txHash), challengeId, walletId: wallet.id };
    }
    if (transactions.status === 422 || data?.challengeStatus === "FAILED" || data?.challengeStatus === "EXPIRED") {
      throw new Error(data?.message || data?.error || "Circle transaction failed.");
    }
    if (attempt < 199) await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error("Circle approved the transaction, but the blockchain transaction hash is still pending after 5 minutes. The transaction was not re-submitted; check Circle wallet activity before retrying.");
}

export type { Address };
