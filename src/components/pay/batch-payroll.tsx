"use client";

import { useState } from "react";
import { Users, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FeeLineItems } from "@/components/ui/fee-line-items";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { quotePayrollBatchFee } from "@/lib/fees";
import { executeSend } from "@/lib/client-actions";
import { usePilotStore } from "@/store/pilot-store";
import type { PayrollRecipient } from "@/types";

const DEFAULT_ROWS: PayrollRecipient[] = [
  {
    label: "Recipient A",
    address: "",
    amountUsdc: "1",
  },
  {
    label: "Recipient B",
    address: "",
    amountUsdc: "1",
  },
];

function isAddress(a: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(a.trim());
}

/**
 * Multi-send USDC on Arc — each row opens a live wallet signature.
 */
export function BatchPayrollCard({ embedded = false }: { embedded?: boolean }) {
  const {
    walletAddress,
    addTransaction,
    setActiveTx,
    setThinking,
    executionMode,
  } = usePilotStore();
  const [rows, setRows] = useState<PayrollRecipient[]>(DEFAULT_ROWS);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [scheduleNote, setScheduleNote] = useState("Immediate batch");
  const fee = quotePayrollBatchFee(rows.length);
  const mode = executionMode();

  function updateRow(i: number, patch: Partial<PayrollRecipient>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((r) => [
      ...r,
      {
        label: `Recipient ${r.length + 1}`,
        address: "",
        amountUsdc: "5",
      },
    ]);
  }

  async function runBatch() {
    if (!walletAddress) {
      setLog(["✗ Connect wallet first"]);
      return;
    }
    for (const row of rows) {
      if (!isAddress(row.address)) {
        setLog([`✗ Invalid address for ${row.label}`]);
        return;
      }
    }

    setBusy(true);
    setThinking(true);
    setConfirm(false);
    setLog([`→ ${scheduleNote} · ${rows.length} live payouts on Arc`]);
    try {
      for (const row of rows) {
        setLog((l) => [
          ...l,
          `→ Paying ${row.label} ${row.amountUsdc} USDC — confirm in Rabby…`,
        ]);
        const tx = await executeSend({
          amount: row.amountUsdc,
          token: "USDC",
          chain: "Arc_Testnet",
          recipient: row.address.trim(),
          recipientLabel: `Payroll · ${row.label}`,
          preferLive: true,
        });
        addTransaction(tx);
        setActiveTx(tx.id);
        setLog((l) => [
          ...l,
          `✓ ${row.label} · ${tx.status}${tx.txHash ? ` · ${tx.txHash.slice(0, 12)}…` : ""}`,
        ]);
      }
      setRows((current) => current.map((row) => ({ ...row, amountUsdc: "0" })));
      setLog((l) => [...l, "✓ Batch complete"]);
    } catch (e) {
      setLog((l) => [
        ...l,
        `✗ ${e instanceof Error ? e.message : "Batch failed"}`,
      ]);
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  const form = (
        <div className="space-y-3">
          {!embedded && (
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Multi-send USDC on Arc. Each recipient triggers a live wallet
            signature (one confirm per payout).
          </p>
          )}
          <Input
            value={scheduleNote}
            onChange={(e) => setScheduleNote(e.target.value)}
            placeholder="Schedule note (e.g. Friday payroll)"
          />
          <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin">
            {rows.map((row, i) => (
              <div key={i} className="space-y-1 rounded-lg border border-white/5 p-2">
                <div className="grid grid-cols-[1fr_80px_auto] gap-1.5 items-center">
                  <Input
                    className="text-xs h-9"
                    value={row.label}
                    onChange={(e) => updateRow(i, { label: e.target.value })}
                    placeholder="Name"
                  />
                  <Input
                    className="text-xs h-9"
                    type="number"
                    value={row.amountUsdc}
                    onChange={(e) =>
                      updateRow(i, { amountUsdc: e.target.value })
                    }
                    placeholder="USDC"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    disabled={rows.length <= 1}
                    onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-slate-500" />
                  </Button>
                </div>
                <Input
                  className="text-[11px] h-8 font-mono"
                  value={row.address}
                  onChange={(e) => updateRow(i, { address: e.target.value })}
                  placeholder="0x recipient address"
                />
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" type="button" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" />
            Add recipient
          </Button>
          <FeeLineItems quote={fee} />
          <Button
            className="w-full"
            size="sm"
            disabled={busy || rows.length === 0 || !walletAddress}
            onClick={() => setConfirm(true)}
          >
            {busy
              ? "Running batch…"
              : walletAddress
                ? `Pay ${rows.length} recipients (live)`
                : "Connect wallet to pay"}
          </Button>
          {log.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-slate-950/50 p-2 font-mono text-[10px] space-y-0.5 max-h-28 overflow-y-auto">
              {log.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("✓")
                      ? "text-emerald-400"
                      : line.startsWith("✗")
                        ? "text-red-400"
                        : "text-slate-500"
                  }
                >
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
  );

  return (
    <>
      {embedded ? (
        form
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-cyan-400" />
              Batch payroll
            </CardTitle>
          </CardHeader>
          <CardContent>{form}</CardContent>
        </Card>
      )}
      <ConfirmDialog
        open={confirm}
        title="Confirm live batch payroll"
        summary={`${scheduleNote}: pay ${rows.length} recipients on Arc Testnet. You will sign each transfer in Rabby.`}
        feeQuote={fee}
        mode={mode}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void runBatch()}
      />
    </>
  );
}
