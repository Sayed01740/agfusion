import type { ChainId } from "@/types";
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER,
  ARC_NETWORK_NAME,
  ARC_TESTNET_RPC,
  ARC_CURRENCY_DECIMALS,
  ARC_CURRENCY_NAME,
  ARC_CURRENCY_SYMBOL,
} from "@/lib/arc-chain";

export interface ChainMeta {
  id: ChainId;
  label: string;
  short: string;
  color: string;
  explorer: string;
  appKitName: string;
  testnet: boolean;
}

export const CHAINS: Record<ChainId, ChainMeta> = {
  Arbitrum: { id: "Arbitrum", label: "Arbitrum", short: "Arbi", color: "#a3a3a3", explorer: "https://explorer.arbitrum.com", appKitName: "Arbitrum", testnet: false },
  Avalanche: { id: "Avalanche", label: "Avalanche", short: "Aval", color: "#a3a3a3", explorer: "https://explorer.avalanche.com", appKitName: "Avalanche", testnet: false },
  Base: { id: "Base", label: "Base", short: "Base", color: "#a3a3a3", explorer: "https://explorer.base.com", appKitName: "Base", testnet: false },
  Codex: { id: "Codex", label: "Codex", short: "Code", color: "#a3a3a3", explorer: "https://explorer.codex.com", appKitName: "Codex", testnet: false },
  Cronos: { id: "Cronos", label: "Cronos", short: "Cron", color: "#a3a3a3", explorer: "https://explorer.cronos.com", appKitName: "Cronos", testnet: false },
  Edge: { id: "Edge", label: "Edge", short: "Edge", color: "#a3a3a3", explorer: "https://explorer.edge.com", appKitName: "Edge", testnet: false },
  Ethereum: { id: "Ethereum", label: "Ethereum", short: "Ethe", color: "#a3a3a3", explorer: "https://explorer.ethereum.com", appKitName: "Ethereum", testnet: false },
  HyperEVM: { id: "HyperEVM", label: "HyperEVM", short: "Hype", color: "#a3a3a3", explorer: "https://explorer.hyperevm.com", appKitName: "HyperEVM", testnet: false },
  Injective: { id: "Injective", label: "Injective", short: "Inje", color: "#a3a3a3", explorer: "https://explorer.injective.com", appKitName: "Injective", testnet: false },
  Ink: { id: "Ink", label: "Ink", short: "Ink", color: "#a3a3a3", explorer: "https://explorer.ink.com", appKitName: "Ink", testnet: false },
  Linea: { id: "Linea", label: "Linea", short: "Line", color: "#a3a3a3", explorer: "https://explorer.linea.com", appKitName: "Linea", testnet: false },
  Monad: { id: "Monad", label: "Monad", short: "Mona", color: "#a3a3a3", explorer: "https://explorer.monad.com", appKitName: "Monad", testnet: false },
  Morph: { id: "Morph", label: "Morph", short: "Morp", color: "#a3a3a3", explorer: "https://explorer.morph.com", appKitName: "Morph", testnet: false },
  Optimism: { id: "Optimism", label: "Optimism", short: "Opti", color: "#a3a3a3", explorer: "https://explorer.optimism.com", appKitName: "Optimism", testnet: false },
  Pharos: { id: "Pharos", label: "Pharos", short: "Phar", color: "#a3a3a3", explorer: "https://explorer.pharos.com", appKitName: "Pharos", testnet: false },
  Plume: { id: "Plume", label: "Plume", short: "Plum", color: "#a3a3a3", explorer: "https://explorer.plume.com", appKitName: "Plume", testnet: false },
  Polygon: { id: "Polygon", label: "Polygon", short: "Poly", color: "#a3a3a3", explorer: "https://explorer.polygon.com", appKitName: "Polygon", testnet: false },
  Sei: { id: "Sei", label: "Sei", short: "Sei", color: "#a3a3a3", explorer: "https://explorer.sei.com", appKitName: "Sei", testnet: false },
  Solana_Devnet: { id: "Solana_Devnet", label: "Solana Devnet", short: "Sola", color: "#a3a3a3", explorer: "https://explorer.solana.com/?cluster=devnet", appKitName: "Solana", testnet: true },
  Sonic: { id: "Sonic", label: "Sonic", short: "Soni", color: "#a3a3a3", explorer: "https://explorer.sonic.com", appKitName: "Sonic", testnet: false },
  Unichain: { id: "Unichain", label: "Unichain", short: "Unic", color: "#a3a3a3", explorer: "https://explorer.unichain.com", appKitName: "Unichain", testnet: false },
  World_Chain: { id: "World_Chain", label: "World Chain", short: "Worl", color: "#a3a3a3", explorer: "https://explorer.worldchain.com", appKitName: "World_Chain", testnet: false },
  XDC: { id: "XDC", label: "XDC", short: "XDC", color: "#a3a3a3", explorer: "https://explorer.xdc.com", appKitName: "XDC", testnet: false },
  Arc_Testnet: {
    id: "Arc_Testnet",
    label: ARC_NETWORK_NAME,
    short: "Arc",
    color: "#a3a3a3",
    explorer: ARC_EXPLORER,
    appKitName: "Arc_Testnet",
    testnet: true,
  },
  Arbitrum_Sepolia: { id: "Arbitrum_Sepolia", label: "Arbitrum Sepolia", short: "Arbi", color: "#a3a3a3", explorer: "https://sepolia.arbiscan.io", appKitName: "Arbitrum_Sepolia", testnet: true },
  Avalanche_Fuji: { id: "Avalanche_Fuji", label: "Avalanche Fuji", short: "Aval", color: "#a3a3a3", explorer: "https://testnet.snowtrace.io", appKitName: "Avalanche_Fuji", testnet: true },
  Base_Sepolia: { id: "Base_Sepolia", label: "Base Sepolia", short: "Base", color: "#a3a3a3", explorer: "https://sepolia.basescan.org", appKitName: "Base_Sepolia", testnet: true },
  Codex_Testnet: { id: "Codex_Testnet", label: "Codex Testnet", short: "Code", color: "#a3a3a3", explorer: "https://explorer.codex.storage", appKitName: "Codex_Testnet", testnet: true },
  Cronos_Testnet: { id: "Cronos_Testnet", label: "Cronos Testnet", short: "Cron", color: "#a3a3a3", explorer: "https://explorer.cronos.org/testnet", appKitName: "Cronos_Testnet", testnet: true },
  Edge_Testnet: { id: "Edge_Testnet", label: "Edge Testnet", short: "Edge", color: "#a3a3a3", explorer: "https://explorer.edge.com", appKitName: "Edge_Testnet", testnet: true },
  Ethereum_Sepolia: { id: "Ethereum_Sepolia", label: "Ethereum Sepolia", short: "Ethe", color: "#a3a3a3", explorer: "https://sepolia.etherscan.io", appKitName: "Ethereum_Sepolia", testnet: true },
  HyperEVM_Testnet: { id: "HyperEVM_Testnet", label: "HyperEVM Testnet", short: "Hype", color: "#a3a3a3", explorer: "https://testnet.purrsec.com", appKitName: "HyperEVM_Testnet", testnet: true },
  Injective_Testnet: { id: "Injective_Testnet", label: "Injective Testnet", short: "Inje", color: "#a3a3a3", explorer: "https://testnet.explorer.injective.network", appKitName: "Injective_Testnet", testnet: true },
  Ink_Testnet: { id: "Ink_Testnet", label: "Ink Testnet", short: "Ink", color: "#a3a3a3", explorer: "https://explorer-sepolia.inkonchain.com", appKitName: "Ink_Testnet", testnet: true },
  Linea_Sepolia: { id: "Linea_Sepolia", label: "Linea Sepolia", short: "Line", color: "#a3a3a3", explorer: "https://sepolia.lineascan.build", appKitName: "Linea_Sepolia", testnet: true },
  Monad_Testnet: { id: "Monad_Testnet", label: "Monad Testnet", short: "Mona", color: "#a3a3a3", explorer: "https://testnet.monadexplorer.com", appKitName: "Monad_Testnet", testnet: true },
  Morph_Testnet: { id: "Morph_Testnet", label: "Morph Testnet", short: "Morp", color: "#a3a3a3", explorer: "https://explorer-testnet.morphl2.io", appKitName: "Morph_Testnet", testnet: true },
  Optimism_Sepolia: { id: "Optimism_Sepolia", label: "Optimism Sepolia", short: "Opti", color: "#a3a3a3", explorer: "https://sepolia-optimism.etherscan.io", appKitName: "Optimism_Sepolia", testnet: true },
  Pharos_Testnet: { id: "Pharos_Testnet", label: "Pharos Testnet", short: "Phar", color: "#a3a3a3", explorer: "https://testnet.pharosscan.xyz", appKitName: "Pharos_Testnet", testnet: true },
  Plume_Testnet: { id: "Plume_Testnet", label: "Plume Testnet", short: "Plum", color: "#a3a3a3", explorer: "https://testnet-explorer.plume.org", appKitName: "Plume_Testnet", testnet: true },
  Polygon_Amoy_Testnet: { id: "Polygon_Amoy_Testnet", label: "Polygon Amoy", short: "Poly", color: "#a3a3a3", explorer: "https://amoy.polygonscan.com", appKitName: "Polygon_Amoy_Testnet", testnet: true },
  Sei_Testnet: { id: "Sei_Testnet", label: "Sei Testnet", short: "Sei", color: "#a3a3a3", explorer: "https://seitrace.com/pacific-1-sandbox", appKitName: "Sei_Testnet", testnet: true },
  Sonic_Testnet: { id: "Sonic_Testnet", label: "Sonic Testnet", short: "Soni", color: "#a3a3a3", explorer: "https://testnet.sonicscan.org", appKitName: "Sonic_Testnet", testnet: true },
  Unichain_Sepolia: { id: "Unichain_Sepolia", label: "Unichain Sepolia", short: "Unic", color: "#a3a3a3", explorer: "https://sepolia.uniscan.xyz", appKitName: "Unichain_Sepolia", testnet: true },
  World_Chain_Sepolia: { id: "World_Chain_Sepolia", label: "World Chain Sepolia", short: "Worl", color: "#a3a3a3", explorer: "https://worldchain-sepolia.explorer.alchemy.com", appKitName: "World_Chain_Sepolia", testnet: true },
  XDC_Apothem: { id: "XDC_Apothem", label: "XDC Apothem", short: "XDC", color: "#a3a3a3", explorer: "https://explorer.apothem.network", appKitName: "XDC_Apothem", testnet: true },
};

/** Ordered list used by UI and agent tooling. */
export const CHAIN_LIST: ChainMeta[] = Object.values(CHAINS);

const CHAIN_ALIASES: Record<string, ChainId> = {
  arc: "Arc_Testnet",
  "arc testnet": "Arc_Testnet",
  base: "Base_Sepolia",
  "base sepolia": "Base_Sepolia",
  ethereum: "Ethereum_Sepolia",
  eth: "Ethereum_Sepolia",
  "ethereum sepolia": "Ethereum_Sepolia",
  "eth sepolia": "Ethereum_Sepolia",
  arbitrum: "Arbitrum_Sepolia",
  arb: "Arbitrum_Sepolia",
  "arbitrum sepolia": "Arbitrum_Sepolia",
  optimism: "Optimism_Sepolia",
  op: "Optimism_Sepolia",
  "optimism sepolia": "Optimism_Sepolia",
  polygon: "Polygon_Amoy_Testnet",
  amoy: "Polygon_Amoy_Testnet",
  "polygon amoy": "Polygon_Amoy_Testnet",
  avalanche: "Avalanche_Fuji",
  avax: "Avalanche_Fuji",
  fuji: "Avalanche_Fuji",
  "avalanche fuji": "Avalanche_Fuji",
  solana: "Solana_Devnet",
  sol: "Solana_Devnet",
  "solana devnet": "Solana_Devnet",
  linea: "Linea_Sepolia",
  "linea sepolia": "Linea_Sepolia",
  unichain: "Unichain_Sepolia",
  "unichain sepolia": "Unichain_Sepolia",
  sonic: "Sonic_Testnet",
  "sonic testnet": "Sonic_Testnet",
  "world chain": "World_Chain_Sepolia",
  "world chain sepolia": "World_Chain_Sepolia",
  xdc: "XDC_Apothem",
  "xdc apothem": "XDC_Apothem",
};

/** Resolve natural-language chain names to the app's canonical testnet ChainId. */
export function resolveChain(value: string | null | undefined): ChainId | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!normalized) return undefined;

  const direct = Object.keys(CHAINS).find(
    (id) => id.toLowerCase().replace(/_/g, " ") === normalized,
  ) as ChainId | undefined;
  if (direct) return direct;

  return CHAIN_ALIASES[normalized];
}

export { ARC_CHAIN_ID, ARC_TESTNET_RPC, ARC_CURRENCY_DECIMALS, ARC_CURRENCY_NAME, ARC_CURRENCY_SYMBOL };
