// @ts-nocheck
import { createWalletClient, createPublicClient, custom, http, type Address, type Chain } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { InjectedProvider } from "./wallet-adapter";
import { ARC_CHAIN_ID } from "@/lib/arc-chain";

const arcTestnet = {
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
} as const satisfies Chain;

export async function createSmartAccountClient(provider: InjectedProvider, address: Address) {
  if (typeof window === "undefined") throw new Error("Window is undefined");
  
  const storageKey = `agfusion_agent_key_${address.toLowerCase()}`;
  let pk = localStorage.getItem(storageKey);
  
  if (!pk) {
    const message = `Generate AGFusion Agent Key for ${address.toLowerCase()}\n\nThis signature is used to derive your autonomous agent's private key so it remains the same across devices.`;
    
    try {
      const signature = await provider.request({
        method: "personal_sign",
        params: [message, address],
      });
      
      const { keccak256, toHex, stringToHex } = await import("viem");
      // keccak256 returns a hex string starting with 0x, which is exactly what we need
      pk = keccak256(stringToHex(signature as string));
      localStorage.setItem(storageKey, pk);
    } catch (e) {
      console.error("Signature rejected", e);
      throw new Error("You must sign the message to enable the Auto-Agent.");
    }
  }

  const localAccount = privateKeyToAccount(pk as `0x${string}`);

  const rpcUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/rpc?chain=arc`
      : arcTestnet.rpcUrls.default.http[0];

  // Create a standard Viem WalletClient using the local key for autonomous execution
  const agentClient = createWalletClient({
    account: localAccount,
    chain: arcTestnet,
    transport: http(rpcUrl),
  });

  return agentClient;
}

export function createEIP1193ProviderProxy(
  agentClient: any,
  baseProvider: InjectedProvider
): InjectedProvider {
  return {
    ...baseProvider, // Inherit events (on, removeListener)
    request: async (args: { method: string; params?: any }) => {
      switch (args.method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [agentClient.account.address];
        
        case "eth_sendTransaction": {
          const tx = args.params?.[0];
          if (!tx) throw new Error("Missing transaction params");
          return await agentClient.sendTransaction({
            account: agentClient.account,
            to: tx.to,
            value: tx.value ? BigInt(tx.value) : 0n,
            data: tx.data,
            gas: tx.gas ? BigInt(tx.gas) : undefined,
            gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
            maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : undefined,
          });
        }
        
        case "personal_sign":
          return await agentClient.signMessage({ message: args.params[0] });
          
        case "eth_signTypedData_v4":
          return await agentClient.signTypedData(JSON.parse(args.params[1]));
          
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return baseProvider.request(args);

        default:
          // Route all other RPCs natively through the Agent's WalletClient transport.
          // This includes eth_gasPrice, eth_feeHistory, eth_getTransactionReceipt, etc.
          return await agentClient.request(args);
      }
    },
  };
}
