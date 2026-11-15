"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AGFusion] Route error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060911] px-4 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/25 bg-[#0c1220]/90 p-6 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 className="font-display text-lg font-semibold text-white">
          Something went wrong
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
          {error.message || "An unexpected client error occurred while rendering this view."}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-slate-500">
            Digest: {error.digest}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10"
          >
            <Home className="h-3.5 w-3.5" />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
