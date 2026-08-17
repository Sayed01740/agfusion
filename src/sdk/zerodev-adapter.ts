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
      
      const { keccak256, stringToHex } = await import("viem");
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

  const agentClient = createWalletClient({
    account: localAccount,
    chain: arcTestnet,
    transport: http(rpcUrl),
  });
  
  // Attach pk so the proxy can rebuild the client for other chains
  (agentClient as any)._pk = pk;

  return agentClient;
}

export function createEIP1193ProviderProxy(
  agentClient: any,
  baseProvider: InjectedProvider
): InjectedProvider {
  // Mutable reference to current active agent client
  let currentAgentClient = agentClient;

  return {
    ...baseProvider, // Inherit events (on, removeListener)
    request: async (args: { method: string; params?: any }) => {
      switch (args.method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [currentAgentClient.account.address];
        
        case "eth_sendTransaction": {
          const tx = args.params?.[0];
          if (!tx) throw new Error("Missing transaction params");

          // Resolve the pending nonce explicitly through the AGFusion same-origin
          // RPC proxy before signing. This prevents viem from making an implicit
          // eth_getTransactionCount call against any SDK/provider default RPC.
          let nonce = tx.nonce;
          if (nonce === undefined || nonce === null || nonce === "") {
            nonce = await currentAgentClient.getTransactionCount({
              address: currentAgentClient.account.address,
              blockTag: "pending",
            });
          }

          return await currentAgentClient.sendTransaction({
            account: currentAgentClient.account,
            to: tx.to,
            value: tx.value ? BigInt(tx.value) : 0n,
            data: tx.data,
            nonce,
            gas: tx.gas ? BigInt(tx.gas) : undefined,
            gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
            maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : undefined,
          });
        }
        
        case "personal_sign":
          return await currentAgentClient.signMessage({ message: args.params[0] });
          
        case "eth_signTypedData_v4":
          return await currentAgentClient.signTypedData(JSON.parse(args.params[1]));
          
        case "wallet_switchEthereumChain": {
          const chainIdHex = args.params?.[0]?.chainId;
          if (!chainIdHex) throw new Error("Missing chainId in switch request");
          
          const chainId = parseInt(chainIdHex, 16);
          const { EVM_CHAIN_PARAMS } = await import("./wallet-adapter");
          
          let targetRpc = "";
          let targetChainObj: any = arcTestnet;
          
          if (chainId === ARC_CHAIN_ID) {
            targetRpc = typeof window !== "undefined" ? `${window.location.origin}/api/rpc?chain=arc` : arcTestnet.rpcUrls.default.http[0];
          } else {
            const param = Object.values(EVM_CHAIN_PARAMS).find((p: any) => p.chainId === chainId);
            if (param) {
              targetChainObj = {
                id: param.chainId,
                name: param.chainName,
                nativeCurrency: param.nativeCurrency,
                rpcUrls: { default: { http: param.rpcUrls } },
                blockExplorers: { default: { name: 'Explorer', url: param.explorers[0] } }
              };
              
              const proxyMap: Record<number, string> = {
                84532: "base",
                11155111: "eth",
                421614: "arb",
                11155420: "op",
                80002: "polygon",
                43113: "avax",
                1301: "unichain",
                59141: "linea",
                57054: "sonic",
              };
              const short = proxyMap[chainId];
              if (short && typeof window !== "undefined") {
                targetRpc = `${window.location.origin}/api/rpc?chain=${short}`;
              } else {
                targetRpc = param.rpcUrls[0];
              }
            } else {
              throw new Error(`Unsupported chain ID for Agent: ${chainId}`);
            }
          }
          
          const { createWalletClient, http } = await import("viem");
          const { privateKeyToAccount } = await import("viem/accounts");
          
          const localAccount = privateKeyToAccount(currentAgentClient._pk as `0x${string}`);
          const newClient = createWalletClient({
            account: localAccount,
            chain: targetChainObj,
            transport: http(targetRpc),
          });
          (newClient as any)._pk = currentAgentClient._pk;
          
          currentAgentClient = newClient;
          
          // Return null to signify successful switch (EIP-3326)
          return null;
        }
        
        case "wallet_addEthereumChain":
          return null; // Agent doesn't need to save chains
          
        case "eth_chainId":
          return `0x${currentAgentClient.chain.id.toString(16)}`;

        default:
          return await currentAgentClient.request(args);
      }
    },
  };
}
