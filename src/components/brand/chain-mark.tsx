import { cn } from "@/lib/utils";

export type SupportedChainMark =
  | "Arc"
  | "Arc_Mainnet"
  | "Arc_Testnet"
  | "Base"
  | "Base_Sepolia"
  | "Arbitrum"
  | "Arbitrum_Sepolia"
  | "Ethereum"
  | "Ethereum_Sepolia"
  | "Optimism"
  | "Optimism_Sepolia"
  | "Avalanche"
  | "Avalanche_Fuji"
  | "Polygon"
  | "Polygon_Amoy"
  | "Unichain"
  | "Unichain_Sepolia"
  | "Linea"
  | "Linea_Sepolia";

const marks: Record<SupportedChainMark, { name: string; short: string; src: string }> = {
  Arc: { name: "Arc Mainnet", short: "ARC", src: "https://www.arc.io/favicon.ico" },
  Arc_Mainnet: { name: "Arc Mainnet", short: "ARC", src: "https://www.arc.io/favicon.ico" },
  Arc_Testnet: { name: "Arc Testnet", short: "ARC", src: "https://www.arc.io/favicon.ico" },
  Base: { name: "Base", short: "BASE", src: "https://cdn.simpleicons.org/base" },
  Base_Sepolia: { name: "Base Sepolia", short: "BASE", src: "https://cdn.simpleicons.org/base" },
  Arbitrum: { name: "Arbitrum", short: "ARB", src: "https://cdn.simpleicons.org/arbitrum" },
  Arbitrum_Sepolia: { name: "Arbitrum Sepolia", short: "ARB", src: "https://cdn.simpleicons.org/arbitrum" },
  Ethereum: { name: "Ethereum", short: "ETH", src: "https://cdn.simpleicons.org/ethereum" },
  Ethereum_Sepolia: { name: "Ethereum Sepolia", short: "ETH", src: "https://cdn.simpleicons.org/ethereum" },
  Optimism: { name: "Optimism", short: "OP", src: "https://cdn.simpleicons.org/optimism" },
  Optimism_Sepolia: { name: "Optimism Sepolia", short: "OP", src: "https://cdn.simpleicons.org/optimism" },
  Avalanche: { name: "Avalanche", short: "AVAX", src: "https://cdn.simpleicons.org/avalanche" },
  Avalanche_Fuji: { name: "Avalanche Fuji", short: "AVAX", src: "https://cdn.simpleicons.org/avalanche" },
  Polygon: { name: "Polygon", short: "POL", src: "https://cdn.simpleicons.org/polygon" },
  Polygon_Amoy: { name: "Polygon Amoy", short: "POL", src: "https://cdn.simpleicons.org/polygon" },
  Unichain: { name: "Unichain", short: "UNI", src: "https://cdn.simpleicons.org/uniswap" },
  Unichain_Sepolia: { name: "Unichain Sepolia", short: "UNI", src: "https://cdn.simpleicons.org/uniswap" },
  Linea: { name: "Linea", short: "LINEA", src: "https://cdn.simpleicons.org/linea" },
  Linea_Sepolia: { name: "Linea Sepolia", short: "LINEA", src: "https://cdn.simpleicons.org/linea" },
};

export function ChainMark({
  chain,
  compact = false,
  className,
}: {
  chain: SupportedChainMark;
  compact?: boolean;
  className?: string;
}) {
  const mark = marks[chain];
  return (
    <span className={cn("inline-flex items-center", compact ? "gap-1.5" : "gap-2", className)} title={mark.name}>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.035]">
        <img src={mark.src} alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" loading="lazy" />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-medium text-slate-200">{mark.name}</span>
          <span className="block text-[9px] tracking-[0.08em] text-slate-500">{mark.short}</span>
        </span>
      )}
    </span>
  );
}

export { marks as SUPPORTED_CHAIN_MARKS };
