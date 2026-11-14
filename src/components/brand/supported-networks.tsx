import { ChainMark, type SupportedChainMark } from "@/components/brand/chain-mark";

const MAINNET_NETWORKS: SupportedChainMark[] = [
  "Arc_Mainnet",
  "Base",
  "Arbitrum",
  "Ethereum",
  "Optimism",
  "Avalanche",
  "Polygon",
  "Unichain",
  "Linea",
  "Solana",
];

const TESTNET_NETWORKS: SupportedChainMark[] = [
  "Arc_Testnet",
  "Base_Sepolia",
  "Arbitrum_Sepolia",
  "Ethereum_Sepolia",
  "Optimism_Sepolia",
  "Avalanche_Fuji",
  "Polygon_Amoy",
  "Unichain_Sepolia",
  "Linea_Sepolia",
  "Solana_Devnet",
];

export function SupportedNetworks({ isMainnet = true }: { isMainnet?: boolean }) {
  const networks = isMainnet ? MAINNET_NETWORKS : TESTNET_NETWORKS;
  return (
    <section aria-label="Supported networks" className="mt-1 border-t border-white/[0.06] pt-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          {isMainnet ? "Live Mainnet Routes" : "Live Testnet Routes"}
        </p>
        <span className="rounded-full border border-white/[0.08] bg-muted/60 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-slate-300">
          {networks.length} NETWORKS
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {networks.map((chain) => (
          <div
            key={chain}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-card/85 px-2.5 py-1.5 transition-colors hover:border-accent/35 hover:bg-card"
          >
            <ChainMark chain={chain} compact size={18} />
            <span className="text-xs font-semibold tracking-tight text-slate-100">
              {chain === "Arc_Mainnet"
                ? "Arc"
                : chain === "Arc_Testnet"
                  ? "Arc Testnet"
                  : chain.replace(/_/g, " ")}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
