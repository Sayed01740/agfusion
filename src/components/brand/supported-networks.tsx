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
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="ag-eyebrow">Connected infrastructure</p>
          <p className="mt-1 text-[11px] text-slate-400">Supported Mainnet &amp; Testnet routes</p>
        </div>
        <span className="font-mono text-[10px] text-slate-400">{NETWORKS.length} NETWORKS</span>
      </div>
      <div className="ag-network-rail">
        {NETWORKS.map((chain) => (
          <div key={chain} className="ag-network-chip">
            <ChainMark chain={chain} compact />
            <span className="text-[11px] font-medium text-slate-200">
              {chain === "Arc_Mainnet" ? "Arc" : chain.replace(/_/g, " ")}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
