"use client";

/**
 * Shared building blocks for the AGFusion dApp (dark, Uniswap-style).
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Check, ExternalLink, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { readErc20Balance } from "@/lib/dapp/erc20";
import type { ArcToken } from "@/lib/dapp/tokens";
import { usePilotStore } from "@/store/pilot-store";
import type { TransactionRecord, TxStep } from "@/types";

/* ----------------------------------------------------------------------- */
/* Balance hook                                                            */
/* ----------------------------------------------------------------------- */

export function useArcBalance(token: ArcToken | null) {
  const walletAddress = usePilotStore((s) => s.walletAddress);
  const [balance, setBalance] = useState<string>("0");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!walletAddress || !token) {
      setBalance("0");
      return;
    }
    setLoading(true);
    try {
      const b = await readErc20Balance(token.address, walletAddress as `0x${string}`, token.decimals);
      setBalance(b);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balance, loading, refresh };
}

export function formatBalance(value: string, maxFrac = 4): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac });
}

/* ----------------------------------------------------------------------- */
/* Token glyph + selector                                                  */
/* ----------------------------------------------------------------------- */

export function TokenGlyph({ token, size = 24 }: { token: ArcToken; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(140deg, ${token.accent}, ${token.accent}99)`,
      }}
      aria-hidden
    >
      {token.symbol.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase()}
    </span>
  );
}

export function TokenSelect({
  value,
  options,
  onChange,
  disabled,
}: {
  value: ArcToken;
  options: ArcToken[];
  onChange: (t: ArcToken) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] py-1.5 pl-1.5 pr-2.5 text-sm font-semibold text-slate-100 transition-colors",
          !disabled && "hover:bg-white/[0.09] hover:border-white/20",
          disabled && "opacity-60",
        )}
      >
        <TokenGlyph token={value} size={24} />
        <span>{value.symbol}</span>
        {!disabled && <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open && !disabled && (
        <>
          <button
            type="button"
            aria-label="Close token menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#0c1219] p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.5)]">
            {options.map((t) => {
              const active = t.symbol === value.symbol;
              return (
                <button
                  key={t.symbol}
                  type="button"
                  onClick={() => {
                    onChange(t);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                    active ? "bg-white/[0.07]" : "hover:bg-white/[0.05]",
                  )}
                >
                  <TokenGlyph token={t} size={26} />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-slate-100">{t.symbol}</span>
                    <span className="block text-[11px] text-slate-500">{t.name}</span>
                  </span>
                  {active && <Check className="h-4 w-4 text-emerald-400" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Amount field                                                            */
/* ----------------------------------------------------------------------- */

export function AmountField({
  label,
  amount,
  onAmountChange,
  token,
  tokenOptions,
  onTokenChange,
  balance,
  onMax,
  readOnly,
  loading,
  secondary,
  lockToken,
}: {
  label: string;
  amount: string;
  onAmountChange?: (v: string) => void;
  token: ArcToken;
  tokenOptions: ArcToken[];
  onTokenChange?: (t: ArcToken) => void;
  balance?: string;
  onMax?: () => void;
  readOnly?: boolean;
  loading?: boolean;
  secondary?: string;
  lockToken?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0a1017] px-4 py-3.5 transition-colors focus-within:border-white/15">
      <div className="mb-1.5 flex items-center justify-between text-[12px] text-slate-500">
        <span>{label}</span>
        {balance !== undefined && (
          <span className="flex items-center gap-1.5">
            <span>Balance: {formatBalance(balance)}</span>
            {onMax && (
              <button
                type="button"
                onClick={onMax}
                className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-400/10"
              >
                MAX
              </button>
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {readOnly ? (
            <div className="flex h-10 items-center text-2xl font-semibold text-slate-100">
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              ) : (
                <span className="truncate">{amount || "0.0"}</span>
              )}
            </div>
          ) : (
            <input
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^\d*\.?\d*$/.test(v)) onAmountChange?.(v);
              }}
              className="h-10 w-full bg-transparent text-2xl font-semibold text-slate-100 outline-none placeholder:text-slate-600"
            />
          )}
          {secondary && <div className="mt-0.5 text-[12px] text-slate-500">{secondary}</div>}
        </div>
        <TokenSelect
          value={token}
          options={tokenOptions}
          onChange={(t) => onTokenChange?.(t)}
          disabled={lockToken}
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Transaction progress + result                                           */
/* ----------------------------------------------------------------------- */

export function StepList({ steps }: { steps: TxStep[] }) {
  if (!steps.length) return null;
  return (
    <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-[#0a1017] p-3">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2.5 text-[13px]">
          <StepIcon state={s.state} />
          <span
            className={cn(
              "flex-1",
              s.state === "success" && "text-slate-300",
              s.state === "active" && "text-slate-100",
              s.state === "error" && "text-red-300",
              (s.state === "pending" || s.state === "noop") && "text-slate-500",
            )}
          >
            {s.name}
            {s.message && <span className="ml-1 text-[11px] text-slate-500">· {s.message}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function StepIcon({ state }: { state: TxStep["state"] }) {
  if (state === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (state === "error") return <XCircle className="h-4 w-4 text-red-400" />;
  if (state === "active") return <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />;
  if (state === "noop") return <Check className="h-4 w-4 text-slate-600" />;
  return <Clock className="h-4 w-4 text-slate-600" />;
}

export function ResultBanner({ record }: { record: TransactionRecord }) {
  const tone =
    record.status === "success"
      ? { cls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200", Icon: CheckCircle2 }
      : record.status === "error"
        ? { cls: "border-red-500/25 bg-red-500/10 text-red-200", Icon: XCircle }
        : { cls: "border-amber-500/25 bg-amber-500/10 text-amber-100", Icon: Clock };
  const { Icon } = tone;
  return (
    <div className={cn("flex items-start gap-2.5 rounded-2xl border p-3 text-[13px]", tone.cls)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="leading-snug">{record.message || record.status}</p>
        {record.explorerUrl && (
          <a
            href={record.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium underline decoration-dotted underline-offset-2 hover:opacity-80"
          >
            View on ArcScan <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-[13px] text-red-200">
      {message}
    </div>
  );
}
