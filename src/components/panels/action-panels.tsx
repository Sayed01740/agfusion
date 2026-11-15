"use client";

import { BridgePanelBody } from "@/components/panels/bridge-panel";
import { SwapPanelBody } from "@/components/panels/legacy-swap-panel";
import { SendPanelBody } from "@/components/panels/send-panel";
import { RecoveryPanelBody } from "@/components/panels/recovery-panel";
import { UnifiedBalancePanelBody } from "@/components/panels/deposit-panel";

export {
  BridgePanelBody,
  SwapPanelBody,
  SendPanelBody,
  RecoveryPanelBody,
  UnifiedBalancePanelBody,
};

/** @deprecated Prefer ToolsWorkspace on the dashboard */
export function ActionPanels() {
  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-white/10 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-300">Send</p>
        <SendPanelBody />
      </div>
      <div className="rounded-xl border border-white/10 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-300">Swap</p>
        <SwapPanelBody />
      </div>
      <div className="rounded-xl border border-white/10 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-300">Bridge</p>
        <BridgePanelBody />
      </div>
      <div className="rounded-xl border border-white/10 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-300">Unified Balance</p>
        <UnifiedBalancePanelBody />
      </div>
      <RecoveryPanelBody />
    </div>
  );
}
