"use client";

import { useEffect, useState } from "react";
import { clearBridgeDebugEvents, downloadBridgeDebugLog, getBridgeDebugEvents, type BridgeDebugEvent } from "@/lib/bridge-debug";

export default function BridgeDiagnosticsPage() {
  const [events, setEvents] = useState<BridgeDebugEvent[]>([]);
  const refresh = () => setEvents(getBridgeDebugEvents());

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">AGFusion</p>
            <h1 className="mt-2 text-2xl font-bold">Bridge Diagnostics</h1>
            <p className="mt-1 text-sm text-slate-400">Persistent wallet, Circle SDK, chain-switch and transaction diagnostics.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={refresh} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">Refresh</button>
            <button onClick={downloadBridgeDebugLog} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Export JSON</button>
            <button onClick={() => { clearBridgeDebugEvents(); refresh(); }} className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-300 hover:bg-red-950">Clear</button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            ["Events", events.length],
            ["Errors", events.filter((e) => e.stage.includes("error") || e.stage.includes("fatal") || e.error).length],
            ["Wallet requests", events.filter((e) => e.stage === "wallet.request").length],
            ["Transactions", events.filter((e) => !!e.data && JSON.stringify(e.data).includes("txHash")).length],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-bold">{value}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-5 py-4">
            <h2 className="font-semibold">Live event stream</h2>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            {events.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No bridge events recorded yet. Start a bridge, then return here.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-950 text-xs uppercase text-slate-500">
                  <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Message</th><th className="px-4 py-3">Data / Error</th></tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-t border-slate-800 align-top hover:bg-slate-800/50">
                      <td className="px-4 py-3 text-slate-500">{event.sequence}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(event.at).toLocaleTimeString()}</td>
                      <td className="px-4 py-3 font-mono text-cyan-300">{event.stage}</td>
                      <td className="px-4 py-3 font-mono text-amber-300">{event.method || ""}</td>
                      <td className="max-w-xs px-4 py-3">{event.message || ""}</td>
                      <td className="min-w-[420px] px-4 py-3"><pre className="whitespace-pre-wrap break-words text-xs text-slate-400">{JSON.stringify({ data: event.data, error: event.error, chainId: event.chainId, txHash: event.txHash, durationMs: event.durationMs }, null, 2)}</pre></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
