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
  | "Polygon_Amoy_Testnet"
  | "Solana"
  | "Solana_Devnet"
  | "Unichain"
  | "Unichain_Sepolia"
  | "Linea"
  | "Linea_Sepolia";

type ChainFamily =
  | "arc"
  | "base"
  | "arbitrum"
  | "ethereum"
  | "optimism"
  | "avalanche"
  | "polygon"
  | "solana"
  | "unichain"
  | "linea";

const marks: Record<SupportedChainMark, { name: string; short: string; family: ChainFamily }> = {
  Arc: { name: "Arc Mainnet", short: "ARC", family: "arc" },
  Arc_Mainnet: { name: "Arc Mainnet", short: "ARC", family: "arc" },
  Arc_Testnet: { name: "Arc Testnet", short: "ARC", family: "arc" },
  Base: { name: "Base", short: "BASE", family: "base" },
  Base_Sepolia: { name: "Base Sepolia", short: "BASE", family: "base" },
  Arbitrum: { name: "Arbitrum", short: "ARB", family: "arbitrum" },
  Arbitrum_Sepolia: { name: "Arbitrum Sepolia", short: "ARB", family: "arbitrum" },
  Ethereum: { name: "Ethereum", short: "ETH", family: "ethereum" },
  Ethereum_Sepolia: { name: "Ethereum Sepolia", short: "ETH", family: "ethereum" },
  Optimism: { name: "Optimism", short: "OP", family: "optimism" },
  Optimism_Sepolia: { name: "Optimism Sepolia", short: "OP", family: "optimism" },
  Avalanche: { name: "Avalanche", short: "AVAX", family: "avalanche" },
  Avalanche_Fuji: { name: "Avalanche Fuji", short: "AVAX", family: "avalanche" },
  Polygon: { name: "Polygon", short: "POL", family: "polygon" },
  Polygon_Amoy: { name: "Polygon Amoy", short: "POL", family: "polygon" },
  Polygon_Amoy_Testnet: { name: "Polygon Amoy", short: "POL", family: "polygon" },
  Solana: { name: "Solana", short: "SOL", family: "solana" },
  Solana_Devnet: { name: "Solana Devnet", short: "SOL", family: "solana" },
  Unichain: { name: "Unichain", short: "UNI", family: "unichain" },
  Unichain_Sepolia: { name: "Unichain Sepolia", short: "UNI", family: "unichain" },
  Linea: { name: "Linea", short: "LINEA", family: "linea" },
  Linea_Sepolia: { name: "Linea Sepolia", short: "LINEA", family: "linea" },
};

function ChainSvg({ family, size }: { family: ChainFamily; size: number }) {
  switch (family) {
    case "arc":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <defs>
            <linearGradient id="arc-official-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B4CCA" />
              <stop offset="65%" stopColor="#8B2D6D" />
              <stop offset="100%" stopColor="#B83268" />
            </linearGradient>
          </defs>
          <path
            d="M7 26C8.2 14.2 11.4 6 16 6s7.8 8.2 9 20h-4c-.7-4.5-1.9-10.8-5-10.8-2.9 0-4.2 5.9-4.9 10.8H7Z"
            fill="url(#arc-official-grad)"
          />
          <path d="M11.5 21.2c3.2-1 6.7-.5 9.8 1.5l-1 3.1c-2.6-1.5-5.6-2-8.8-1.4v-3.2Z" fill="url(#arc-official-grad)" />
        </svg>
      );
    case "base":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <circle cx="16" cy="16" r="15" fill="#0052FF" />
          <path d="M16 6.5a9.5 9.5 0 1 1-9.4 11h9.4v-3H6.6A9.5 9.5 0 0 1 16 6.5Z" fill="#fff" />
        </svg>
      );
    case "ethereum":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <circle cx="16" cy="16" r="15" fill="#627EEA" />
          <path d="M16 6.5 10.2 16.2 16 19.6l5.8-3.4L16 6.5Z" fill="#fff" />
          <path d="M16 25.5 10.2 17.5 16 20.9l5.8-3.4L16 25.5Z" fill="#fff" fillOpacity="0.75" />
        </svg>
      );
    case "arbitrum":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="#213147" stroke="#28A0F0" strokeWidth="2" />
          <path d="M11 22.5 16 9.5l5 13M13 18h6" fill="none" stroke="#28A0F0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "optimism":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <circle cx="16" cy="16" r="15" fill="#FF0420" />
          <text x="16" y="20" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="800" fontFamily="sans-serif">OP</text>
        </svg>
      );
    case "avalanche":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <circle cx="16" cy="16" r="15" fill="#E84142" />
          <path d="M16 8.5 9.2 21.5h4.2l2.6-5.2 2.6 5.2h4.2L16 8.5Z" fill="#fff" />
        </svg>
      );
    case "polygon":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <circle cx="16" cy="16" r="15" fill="#8247E5" />
          <path
            d="M19.8 12.2 16 10l-3.8 2.2v4.4l3.8 2.2 3.8-2.2v-4.4Zm-7.6 5.4-2.5 1.4v3.2l2.5 1.4 2.5-1.4v-3.2l-2.5-1.4Z"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "solana":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <defs>
            <linearGradient id="sol-grad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#9945FF" />
              <stop offset="100%" stopColor="#14F195" />
            </linearGradient>
          </defs>
          <circle cx="16" cy="16" r="15" fill="#0B1017" stroke="url(#sol-grad)" strokeWidth="1.5" />
          <path d="M9.5 11.2h11.5l1.8-2H11.3l-1.8 2Zm0 5.8h13l-1.8-2h-11.2l0 2Zm1.8 5.8h11.5l-1.8-2H9.5l1.8 2Z" fill="url(#sol-grad)" />
        </svg>
      );
    case "unichain":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <circle cx="16" cy="16" r="15" fill="#FF007A" />
          <circle cx="16" cy="16" r="6" fill="none" stroke="#fff" strokeWidth="2.5" />
        </svg>
      );
    case "linea":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <circle cx="16" cy="16" r="15" fill="#121212" stroke="#61DFFF" strokeWidth="1.5" />
          <path d="M11 10v11h10" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="20" cy="11" r="2.2" fill="#61DFFF" />
        </svg>
      );
  }
}

export function normalizeChainMark(chain: string): SupportedChainMark {
  if (chain in marks) return chain as SupportedChainMark;
  const lower = chain.toLowerCase();
  if (lower.includes("arc") && lower.includes("test")) return "Arc_Testnet";
  if (lower.includes("arc")) return "Arc_Mainnet";
  if (lower.includes("base")) return lower.includes("sepolia") ? "Base_Sepolia" : "Base";
  if (lower.includes("arb")) return lower.includes("sepolia") ? "Arbitrum_Sepolia" : "Arbitrum";
  if (lower.includes("eth")) return lower.includes("sepolia") ? "Ethereum_Sepolia" : "Ethereum";
  if (lower.includes("opt")) return lower.includes("sepolia") ? "Optimism_Sepolia" : "Optimism";
  if (lower.includes("avax") || lower.includes("aval")) return "Avalanche";
  if (lower.includes("poly")) return "Polygon";
  if (lower.includes("sol")) return "Solana";
  return "Arc_Mainnet";
}

export function ChainMark({
  chain,
  compact = false,
  size = 18,
  className,
}: {
  chain: SupportedChainMark | string;
  compact?: boolean;
  size?: number;
  className?: string;
}) {
  const key = normalizeChainMark(String(chain));
  const mark = marks[key];
  return (
    <span className={cn("inline-flex items-center shrink-0", compact ? "gap-1.5" : "gap-2", className)} title={mark.name}>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
        <ChainSvg family={mark.family} size={size} />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-medium text-slate-200">{mark.name}</span>
          <span className="block text-[9px] tracking-[0.08em] text-slate-400">{mark.short}</span>
        </span>
      )}
    </span>
  );
}

export { marks as SUPPORTED_CHAIN_MARKS };
