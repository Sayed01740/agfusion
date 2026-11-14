import { ChainMark, type SupportedChainMark } from "@/components/brand/chain-mark";

const NETWORKS: SupportedChainMark[] = [
  "Arc_Mainnet",
  "Base",
  "Arbitrum",
  "Ethereum",
  "Optimism",
  "Avalanche",
  "Polygon",
  "Solana",
];

export function SupportedNetworks() {
  return (
    <section aria-label="Supported networks" className="mt-5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Connected infrastructure
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Supported Mainnet &amp; Testnet routes
          </p>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {NETWORKS.length} NETWORKS
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {NETWORKS.map((chain) => (
          <div
            key={chain}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/80 px-2.5 py-1.5"
          >
            <ChainMark chain={chain} compact size={18} />
            <span className="text-xs font-medium text-foreground">
              {chain === "Arc_Mainnet" ? "Arc" : chain.replace(/_/g, " ")}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
