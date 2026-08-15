import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  parseUnits,
  keccak256,
  decodeEventLog,
  pad,
} from "viem";
import {
  getInjectedProvider,
  switchToChainId,
  EVM_CHAIN_PARAMS,
  ARC_CHAIN_ID,
} from "@/sdk/wallet-adapter";
import type { ChainId, TransactionRecord, TxStep } from "@/types";
import { uid, sleep } from "@/lib/utils";
import { CHAINS } from "@/lib/chains";
import { estimateBridgeDemo } from "@/blockchain/appkit-service";

// --- CCTP Configuration ---
// Circle CCTP v2 testnet domain assignments.
// Reference: https://developers.circle.com/stablecoins/docs/supported-domains
const CCTP_DOMAINS: Partial<Record<ChainId, number>> = {
  Ethereum_Sepolia:    0,
  Avalanche_Fuji:      1,
  Optimism_Sepolia:    2,
  Arbitrum_Sepolia:    3,
  Base_Sepolia:        6,
  Polygon_Amoy_Testnet: 7,
  Unichain_Sepolia:    10,
  Linea_Sepolia:       11,
  Sonic_Testnet:       13,
  Arc_Testnet:         26,
};

// Circle CCTP v2 testnet contract addresses.
// TokenMessenger and MessageTransmitter are IDENTICAL across all EVM chains for V2.
// Only the USDC token address differs per chain.
const CCTP_V2_TOKEN_MESSENGER    = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as `0x${string}`;
const CCTP_V2_MSG_TRANSMITTER    = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as `0x${string}`;

const CCTP_CONTRACTS: Partial<
  Record<
    ChainId,
    { USDC: `0x${string}`; TokenMessenger: `0x${string}`; MessageTransmitter: `0x${string}` }
  >
> = {
  Arc_Testnet: {
    USDC: "0x3600000000000000000000000000000000000000",
    TokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    MessageTransmitter: CCTP_V2_MSG_TRANSMITTER,
  },
  Ethereum_Sepolia: {
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    TokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    MessageTransmitter: CCTP_V2_MSG_TRANSMITTER,
  },
  Base_Sepolia: {
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    TokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    MessageTransmitter: CCTP_V2_MSG_TRANSMITTER,
  },
  Arbitrum_Sepolia: {
    USDC: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    TokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    MessageTransmitter: CCTP_V2_MSG_TRANSMITTER,
  },
  Optimism_Sepolia: {
    USDC: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    TokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    MessageTransmitter: CCTP_V2_MSG_TRANSMITTER,
  },
  Polygon_Amoy_Testnet: {
    USDC: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    TokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    MessageTransmitter: CCTP_V2_MSG_TRANSMITTER,
  },
  Avalanche_Fuji: {
    USDC: "0x5425890298aed601595a70AB815c96711a31Bc65",
    TokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    MessageTransmitter: CCTP_V2_MSG_TRANSMITTER,
  },
  Unichain_Sepolia: {
    USDC: "0x31d0220469827808B5c07F8b8a56800bAB864Fa1",
    TokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    MessageTransmitter: CCTP_V2_MSG_TRANSMITTER,
  },
  Linea_Sepolia: {
    USDC: "0xFEce4462D57bD51A6A552365A011b95f0E16d9B7",
    TokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    MessageTransmitter: CCTP_V2_MSG_TRANSMITTER,
  },
  Sonic_Testnet: {
    USDC: "0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51",
    TokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    MessageTransmitter: CCTP_V2_MSG_TRANSMITTER,
  },
};

// --- ABIs ---
const ERC20_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const TOKEN_MESSENGER_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint32", name: "destinationDomain", type: "uint32" },
      { internalType: "bytes32", name: "mintRecipient", type: "bytes32" },
      { internalType: "address", name: "burnToken", type: "address" },
    ],
    name: "depositForBurn",
    outputs: [{ internalType: "uint64", name: "_nonce", type: "uint64" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const MESSAGE_TRANSMITTER_ABI = [
  {
    inputs: [
      { internalType: "bytes", name: "message", type: "bytes" },
      { internalType: "bytes", name: "attestation", type: "bytes" },
    ],
    name: "receiveMessage",
    outputs: [{ internalType: "bool", name: "success", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "bytes", name: "message", type: "bytes" },
    ],
    name: "MessageSent",
    type: "event",
  },
] as const;

async function getViemClients(chainId: ChainId) {
  const provider = await getInjectedProvider();
  
  let targetChainId: number;
  let rpcUrl: string;

  if (chainId === "Arc_Testnet") {
    targetChainId = ARC_CHAIN_ID;
    rpcUrl = EVM_CHAIN_PARAMS["Arc_Testnet"].rpcUrls[0];
  } else {
    const p = EVM_CHAIN_PARAMS[chainId];
    if (!p) throw new Error(`Chain parameters missing for ${chainId}`);
    targetChainId = p.chainId;
    rpcUrl = p.rpcUrls[0];
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  let proxyRpc = rpcUrl;
  if (origin) {
    const chainProxyMap: Partial<Record<ChainId, string>> = {
      Arc_Testnet:          `${origin}/api/rpc?chain=arc`,
      Base_Sepolia:         `${origin}/api/rpc?chain=base`,
      Ethereum_Sepolia:     `${origin}/api/rpc?chain=eth`,
      Arbitrum_Sepolia:     `${origin}/api/rpc?chain=arb`,
      Optimism_Sepolia:     `${origin}/api/rpc?chain=op`,
      Polygon_Amoy_Testnet: `${origin}/api/rpc?chain=polygon`,
      Avalanche_Fuji:       `${origin}/api/rpc?chain=avax`,
      Unichain_Sepolia:     `${origin}/api/rpc?chain=unichain`,
    };
    proxyRpc = chainProxyMap[chainId] ?? rpcUrl;
  }

  const publicClient = createPublicClient({
    transport: http(proxyRpc),
  });

  const walletClient = createWalletClient({
    transport: custom(provider),
  });

  return { walletClient, publicClient, provider };
}

export async function runNativeCctpBridge(params: {
  amount: string;
  fromChain: ChainId;
  toChain: ChainId;
  onStep?: (steps: TxStep[]) => void;
}): Promise<TransactionRecord> {
  const srcConfig = CCTP_CONTRACTS[params.fromChain];
  const dstConfig = CCTP_CONTRACTS[params.toChain];
  const destDomain = CCTP_DOMAINS[params.toChain];

  if (!srcConfig || !dstConfig || destDomain === undefined) {
    throw new Error(
      `Native CCTP bridge not yet configured for ${params.fromChain} -> ${params.toChain}`
    );
  }

  const steps: TxStep[] = [
    { name: `Connect & Switch to ${CHAINS[params.fromChain].short}`, state: "active" },
    { name: "Approve USDC", state: "pending" },
    { name: "Burn (Source)", state: "pending" },
    { name: "Wait for Attestation", state: "pending" },
    { name: `Mint on ${CHAINS[params.toChain].short}`, state: "pending" },
  ];

  params.onStep?.(steps.map((s) => ({ ...s })));

  try {
    // 1. Prepare Source Chain
    const { provider, walletClient: srcWallet, publicClient: srcPublic } = await getViemClients(params.fromChain);
    
    // Use the AppKit chain identifier (e.g., "Base_Sepolia") for wallet switching
    await switchToChainId(provider, CHAINS[params.fromChain].appKitName);
    
    const [address] = await srcWallet.getAddresses();
    if (!address) throw new Error("No wallet connected");

    const amountInWei = parseUnits(params.amount, 6);

    // 2. Approve
    steps[0].state = "success";
    steps[1].state = "active";
    params.onStep?.(steps.map((s) => ({ ...s })));

    console.log(`[CCTP] Approving ${params.amount} USDC on ${params.fromChain}`);
    const approveTx = await srcWallet.writeContract({
      address: srcConfig.USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [srcConfig.TokenMessenger, amountInWei],
      account: address,
      chain: null,
    });

    await srcPublic.waitForTransactionReceipt({ hash: approveTx });

    // 3. Deposit for Burn
    steps[1].state = "success";
    steps[2].state = "active";
    params.onStep?.(steps.map((s) => ({ ...s })));

    console.log(`[CCTP] Calling depositForBurn on ${params.fromChain} for domain ${destDomain}`);
    const recipientBytes32 = pad(address, { size: 32 });

    const burnTx = await srcWallet.writeContract({
      address: srcConfig.TokenMessenger,
      abi: TOKEN_MESSENGER_ABI,
      functionName: "depositForBurn",
      args: [amountInWei, destDomain, recipientBytes32, srcConfig.USDC],
      account: address,
      chain: null,
    });

    const burnReceipt = await srcPublic.waitForTransactionReceipt({ hash: burnTx });
    console.log(`[CCTP] Burn successful: ${burnTx}`);

    steps[2].state = "success";
    steps[2].txHash = burnTx;
    steps[3].state = "active";
    params.onStep?.(steps.map((s) => ({ ...s })));

    // 4. Wait for Attestation
    let messageBytes: string | null = null;
    for (const log of burnReceipt.logs) {
      if (log.address.toLowerCase() === srcConfig.MessageTransmitter.toLowerCase()) {
        try {
          const decoded = decodeEventLog({
            abi: MESSAGE_TRANSMITTER_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "MessageSent") {
            messageBytes = decoded.args.message;
            break;
          }
        } catch (e) {
          // Ignore logs that don't match our ABI
        }
      }
    }

    if (!messageBytes) {
      throw new Error("MessageSent log not found in burn transaction.");
    }

    const messageHash = keccak256(messageBytes as `0x${string}`);
    console.log(`[CCTP] Message Hash: ${messageHash}`);

    let attestation: string | null = null;
    for (let i = 0; i < 40; i++) { // Max ~200 seconds
      console.log(`[CCTP] Polling Iris API (Attempt ${i + 1})...`);
      const res = await fetch(`https://iris-api.circle.com/v2/attestations/${messageHash}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "complete" && data.attestation) {
          attestation = data.attestation;
          console.log(`[CCTP] Attestation received!`);
          break;
        }
      }
      await sleep(5000);
    }

    if (!attestation) {
      throw new Error("Timed out waiting for Circle attestation. The funds are burned but not minted.");
    }

    // 5. Mint on Destination Chain
    steps[3].state = "success";
    steps[4].state = "active";
    params.onStep?.(steps.map((s) => ({ ...s })));

    const { provider: dstProvider, walletClient: dstWallet, publicClient: dstPublic } = await getViemClients(params.toChain);
    
    console.log(`[CCTP] Switching to ${params.toChain}`);
    // Switch destination wallet using the AppKit chain name
    await switchToChainId(dstProvider, CHAINS[params.toChain].appKitName);
    
    const [dstAddress] = await dstWallet.getAddresses();
    if (!dstAddress) throw new Error("No wallet connected on destination");

    console.log(`[CCTP] Calling receiveMessage on ${params.toChain}`);
    const mintTx = await dstWallet.writeContract({
      address: dstConfig.MessageTransmitter,
      abi: MESSAGE_TRANSMITTER_ABI,
      functionName: "receiveMessage",
      args: [messageBytes as `0x${string}`, attestation as `0x${string}`],
      account: dstAddress,
      chain: null,
    });

    await dstPublic.waitForTransactionReceipt({ hash: mintTx });
    console.log(`[CCTP] Mint successful: ${mintTx}`);

    steps[4].state = "success";
    steps[4].txHash = mintTx;
    params.onStep?.(steps.map((s) => ({ ...s })));

    return {
      id: uid("tx"),
      type: "bridge",
      status: "success",
      amount: params.amount,
      token: "USDC",
      fromChain: params.fromChain,
      toChain: params.toChain,
      feeUsd: estimateBridgeDemo(params.amount, params.fromChain, params.toChain).feeUsd,
      steps,
      txHash: mintTx,
      explorerUrl: CHAINS[params.toChain].explorer + `/tx/${mintTx}`,
      createdAt: new Date().toISOString(),
      message: `Bridged ${params.amount} USDC ${params.fromChain} → ${params.toChain}`,
      executionMode: "live",
    };

  } catch (error: any) {
    console.error("[AGFusion] Native CCTP Bridge Error:", error);
    const failIndex = steps.findIndex(s => s.state === "active");
    if (failIndex >= 0) {
      steps[failIndex].state = "error";
      steps[failIndex].message = error.message || "Unknown error";
    }
    params.onStep?.(steps.map((s) => ({ ...s })));
    throw error;
  }
}
