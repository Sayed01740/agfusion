import { cn } from "@/lib/utils";

export type SupportedTokenMark = "USDC" | "EURC" | "cirBTC" | "wETH" | "NATIVE";

function TokenSvg({ token, size }: { token: SupportedTokenMark; size: number }) {
  switch (token) {
    case "USDC":
    case "NATIVE":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#2775CA" />
          <path
            d="M12.2 8.8a8.2 8.2 0 0 0 0 14.4M19.8 8.8a8.2 8.2 0 0 1 0 14.4"
            fill="none"
            stroke="#fff"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <path
            d="M16 9.5v13M18.6 13.1c0-1.2-1.1-2-2.6-2s-2.6.8-2.6 2c0 1.3 1.1 1.8 2.6 2.2 1.5.4 2.6.9 2.6 2.2 0 1.3-1.1 2.1-2.6 2.1s-2.6-.8-2.6-2"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "EURC":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#1B4F9C" />
          <path
            d="M11.8 8.8a8.2 8.2 0 0 0 0 14.4M20.2 8.8a8.2 8.2 0 0 1 0 14.4"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M19.2 12.2a4.3 4.3 0 1 0 0 7.6M11.6 14.7h6.2M11.6 17.3h5.4"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "cirBTC":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#F7931A" />
          <path
            d="M14 9.5v13M17.2 9.5v13M12.2 11.4h5.3a2.4 2.4 0 0 1 0 4.6h-5.3m0 0h5.8a2.5 2.5 0 0 1 0 4.8h-5.8"
            fill="none"
            stroke="#fff"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "wETH":
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
          <circle cx="16" cy="16" r="16" fill="#627EEA" />
          <path d="M16 6.5 10.5 16l5.5 3.3 5.5-3.3L16 6.5Z" fill="#fff" fillOpacity="0.95" />
          <path d="M16 25.5 10.5 17.7l5.5 3.3 5.5-3.3L16 25.5Z" fill="#fff" fillOpacity="0.75" />
        </svg>
      );
  }
}

export function TokenMark({
  token,
  size = 20,
  showLabel = false,
  className,
}: {
  token: string;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const key = (
    token === "EURC" || token === "cirBTC" || token === "wETH" || token === "NATIVE"
      ? token
      : "USDC"
  ) as SupportedTokenMark;

  return (
    <span className={cn("inline-flex items-center gap-1.5 shrink-0", className)} title={token}>
      <TokenSvg token={key} size={size} />
      {showLabel && <span className="font-semibold text-foreground">{token}</span>}
    </span>
  );
}
