import { ChainMark, type SupportedChainMark } from "@/components/brand/chain-mark";

const MAINNET_NETWORKS: SupportedChainMark[] = [
  "Arc_Mainnet",
  "Base",
  "Arbitrum",
  "Ethereum",
  "Optimism",
  "Avalanche",
  "Polygon",
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
  "Solana_Devnet",
];

export function SupportedNetworks({ isMainnet = true }: { isMainnet?: boolean }) {
  const networks = isMainnet ? MAINNET_NETWORKS : TESTNET_NETWORKS;
  return (
    <section aria-label="Supported networks" className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {isMainnet ? "Live Mainnet Routes" : "Live Testnet Routes"}
        </p>
        <span className="font-mono text-[10px] text-muted-foreground">
          {networks.length} NETWORKS
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {networks.map((chain) => (
          <div
            key={chain}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/80 px-2.5 py-1.5"
          >
            <ChainMark chain={chain} compact size={18} />
            <span className="text-xs font-medium text-foreground">
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
