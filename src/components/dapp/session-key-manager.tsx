"use client";

import { useState, useEffect } from "react";
import { KeyRound, Shield, Zap, Clock, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getSessionPolicy,
  saveSessionPolicy,
  type SessionPolicy,
} from "@/lib/dapp/session-keys";

export function SessionKeyManager() {
  const [policy, setPolicy] = useState<SessionPolicy>(getSessionPolicy());
  const [editing, setEditing] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(policy.maxDailySpendUsdc.toString());
  const [perTxLimit, setPerTxLimit] = useState(policy.maxPerTxUsdc.toString());

  useEffect(() => {
    setPolicy(getSessionPolicy());
  }, []);

  function toggleActive() {
    const updated = {
      ...policy,
      enabled: !policy.enabled,
      validUntil: Date.now() + 24 * 60 * 60 * 1000,
    };
    saveSessionPolicy(updated);
    setPolicy(updated);
  }

  function handleSave() {
    const updated = {
      ...policy,
      maxDailySpendUsdc: Number(dailyLimit) || 10,
      maxPerTxUsdc: Number(perTxLimit) || 2,
    };
    saveSessionPolicy(updated);
    setPolicy(updated);
    setEditing(false);
  }

  const remainingDaily = Math.max(
    0,
    policy.maxDailySpendUsdc - policy.spentTodayUsdc
  );

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
            <KeyRound className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              Autonomous Session Key
              <Badge
                variant="outline"
                className="text-[10px] border-indigo-500/30 text-indigo-300"
              >
                ERC-7715
              </Badge>
            </h3>
            <p className="text-[11px] text-slate-400">
              Grant AI Agents scoped, policy-bound micro-spending on Arc
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleActive}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            policy.enabled
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
              : "bg-white/[0.05] text-slate-400 border border-white/[0.1] hover:text-slate-200"
          }`}
        >
          {policy.enabled ? "Active" : "Disabled"}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 my-3 text-[12px]">
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
          <div className="text-slate-500 text-[11px]">Daily Allowance</div>
          <div className="font-mono font-semibold text-slate-200">
            ${policy.maxDailySpendUsdc.toFixed(2)} USDC
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
          <div className="text-slate-500 text-[11px]">Max Per Tx</div>
          <div className="font-mono font-semibold text-slate-200">
            ${policy.maxPerTxUsdc.toFixed(2)} USDC
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04] col-span-2 sm:col-span-1">
          <div className="text-slate-500 text-[11px]">Remaining Today</div>
          <div className="font-mono font-semibold text-emerald-400">
            ${remainingDaily.toFixed(2)} USDC
          </div>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3 pt-2 border-t border-white/[0.06]">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-400">Daily Cap ($)</label>
              <Input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                className="h-8 text-xs bg-black/40 border-white/[0.1]"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Per-Tx Cap ($)</label>
              <Input
                type="number"
                value={perTxLimit}
                onChange={(e) => setPerTxLimit(e.target.value)}
                className="h-8 text-xs bg-black/40 border-white/[0.1]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              className="h-7 text-xs text-slate-400"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              Save Policy
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-white/[0.06]">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-indigo-400" />
            Auto-expires every 24h
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-indigo-400 hover:text-indigo-300 font-medium"
          >
            Edit Limits
          </button>
        </div>
      )}
    </div>
  );
}
