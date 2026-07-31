/**
 * ERC-8004 IdentityRegistry registration on Arc Testnet.
 * Docs: https://docs.arc.io/arc/tutorials/register-your-first-ai-agent
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseAbiItem,
  type Address,
  type Hash,
} from "viem";
import { arcTestnet } from "@/lib/arc-chain";
import {
  getInjectedProvider,
  requestAccounts,
  switchToArcTestnet,
} from "@/sdk/wallet-adapter";
import { AGFUSION_METADATA_URI } from "@/lib/onchain";

/** Official ERC-8004 IdentityRegistry on Arc Testnet */
export const ERC8004_IDENTITY_REGISTRY =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;

export const ERC8004_REPUTATION_REGISTRY =
  "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;

export const ERC8004_VALIDATION_REGISTRY =
  "0x8004Cb1BF31DAf7788923b405b754f57acEB4272" as const;

const registerAbi = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "metadataURI", type: "string" }],
    outputs: [],
  },
] as const;

export type Erc8004RegisterResult = {
  txHash: Hash;
  agentId: string | null;
  owner: Address;
  metadataURI: string;
  explorerUrl: string;
  registry: string;
};

/**
 * Register AGFusion (or any agent) on ERC-8004 IdentityRegistry.
 * User signs with connected wallet on Arc Testnet.
 */
export async function registerErc8004Agent(opts?: {
  metadataURI?: string;
}): Promise<Erc8004RegisterResult> {
  if (typeof window === "undefined") {
    throw new Error("ERC-8004 registration must run in the browser.");
  }

  const metadataURI = opts?.metadataURI || AGFUSION_METADATA_URI;
  const provider = await getInjectedProvider();
  const accounts = await requestAccounts(provider);
  const owner = accounts[0] as Address | undefined;
  if (!owner) {
    throw new Error("Connect Rabby / MetaMask first, then register.");
  }

  await switchToArcTestnet(provider);

  const walletClient = createWalletClient({
    account: owner,
    chain: arcTestnet,
    transport: custom(provider as never),
  });

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(
      typeof window !== "undefined"
        ? `${window.location.origin}/api/rpc?chain=arc`
        : arcTestnet.rpcUrls.default.http[0],
    ),
  });

  const txHash = await walletClient.writeContract({
    address: ERC8004_IDENTITY_REGISTRY,
    abi: registerAbi,
    functionName: "register",
    args: [metadataURI],
    account: owner,
    chain: arcTestnet,
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });

  // Resolve agent tokenId from Transfer events to this owner
  let agentId: string | null = null;
  try {
    const latest = await publicClient.getBlockNumber();
    const range = BigInt(8000);
    const fromBlock = latest > range ? latest - range : BigInt(0);
    const logs = await publicClient.getLogs({
      address: ERC8004_IDENTITY_REGISTRY,
      event: parseAbiItem(
        "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
      ),
      args: { to: owner },
      fromBlock,
      toBlock: latest,
    });
    if (logs.length > 0) {
      const last = logs[logs.length - 1];
      agentId = last.args.tokenId?.toString() ?? null;
    }
  } catch {
    /* agentId optional if log query limited */
  }

  return {
    txHash,
    agentId,
    owner,
    metadataURI,
    explorerUrl: `https://testnet.arcscan.app/tx/${txHash}`,
    registry: ERC8004_IDENTITY_REGISTRY,
  };
}

export function erc8004GlobalId(agentId: string): string {
  return `eip155:5042002:${ERC8004_IDENTITY_REGISTRY}:${agentId}`;
}
