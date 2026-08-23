"use client";

import { useEffect, useMemo, useState } from "react";
import { clearBridgeDebugEvents, downloadBridgeDebugLog, getBridgeDebugEvents, type BridgeDebugEvent } from "@/lib/bridge-debug";

type ServerEvent = { id: string; sessionId: string; createdAt: string; walletAddress?: string | null; event: BridgeDebugEvent | null };

export default function BridgeDiagnosticsPage() {
  const [localEvents, setLocalEvents] = useState<BridgeDebugEvent[]>([]);
  const [serverEvents, setServerEvents] = useState<ServerEvent[]>([]);
  const [storage, setStorage] = useState("checking");
  const [selected, setSelected] = useState<BridgeDebugEvent | null>(null);
  const refresh = async () => {
    setLocalEvents(getBridgeDebugEvents());
    try {
      const response = await fetch("/api/bridge-diagnostics?limit=2000", { cache: "no-store" });
      const json = await response.json();
      setServerEvents(Array.isArray(json.events) ? json.events : []);
      setStorage(json.storage || "unknown");
    } catch { setStorage("server-unavailable"); }
  };

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 1500); return () => window.clearInterval(timer); }, []);

  const events = useMemo(() => {
    if (serverEvents.length) return serverEvents.map((x) => x.event).filter(Boolean) as BridgeDebugEvent[];
    return localEvents;
  }, [serverEvents, localEvents]);
  const errors = events.filter((e) => e.stage.includes("error") || e.stage.includes("fatal") || !!e.error);
  const requests = events.filter((e) => e.stage === "wallet.request");
  const chains = [...new Set(events.map((e) => e.chainId).filter(Boolean))];

  const exportAll = () => {
    const payload = { diagnosticVersion: 5, exportedAt: new Date().toISOString(), storage, eventCount: events.length, sessions: [...new Set(serverEvents.map((e) => e.sessionId))], events };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `agfusion-bridge-diagnostics-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">AGFusion</p><h1 className="mt-2 text-2xl font-bold">Bridge Diagnostics</h1><p className="mt-1 text-sm text-slate-400">Full bridge execution trace from wallet RPC through Circle SDK and destination settlement.</p></div>
            <div className="flex flex-wrap gap-2"><button onClick={() => void refresh()} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">Refresh</button><button onClick={exportAll} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Export server data</button><button onClick={downloadBridgeDebugLog} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">Export browser data</button><button onClick={() => { clearBridgeDebugEvents(); setLocalEvents([]); }} className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-300">Clear browser</button></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-3 py-1 ${storage === "database" ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"}`}>Server storage: {storage}</span><span className="rounded-full bg-slate-800 px-3 py-1">Chains: {chains.join(", ") || "none yet"}</span><span className="rounded-full bg-slate-800 px-3 py-1">Sessions: {new Set(serverEvents.map((e) => e.sessionId)).size}</span></div>
        </header>

        <section className="grid gap-4 md:grid-cols-4"><Metric label="Events" value={events.length}/><Metric label="Errors" value={errors.length}/><Metric label="Wallet requests" value={requests.length}/><Metric label="Server events" value={serverEvents.length}/></section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"><div className="border-b border-slate-800 px-5 py-4"><h2 className="font-semibold">Execution timeline</h2><p className="mt-1 text-xs text-slate-500">Click any row to inspect the complete event payload and error object.</p></div><div className="max-h-[70vh] overflow-auto">{events.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No bridge events recorded yet.</div> : <table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-950 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Chain</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Message</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} onClick={() => setSelected(event)} className={`cursor-pointer border-t border-slate-800 align-top hover:bg-slate-800/70 ${event.error || event.stage.includes("error") || event.stage.includes("fatal") ? "bg-red-950/20" : ""}`}><td className="px-4 py-3 text-slate-500">{event.sequence}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(event.at).toLocaleTimeString()}</td><td className="px-4 py-3 font-mono text-cyan-300">{event.stage}</td><td className="px-4 py-3 font-mono text-amber-300">{event.chainId || "-"}</td><td className="px-4 py-3 font-mono text-violet-300">{event.method || "-"}</td><td className="max-w-xl px-4 py-3">{event.message || "-"}</td></tr>)}</tbody></table>}</div></section>

        {selected && <section className="rounded-2xl border border-cyan-900 bg-slate-900 p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Event #{selected.sequence}: {selected.stage}</h2><button onClick={() => setSelected(null)} className="text-sm text-slate-400">Close</button></div><pre className="mt-4 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 text-xs text-slate-300">{JSON.stringify(selected, null, 2)}</pre></section>}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>; }
