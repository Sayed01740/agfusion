"use client";

import { useMemo, useState } from "react";
import { QrCode, Copy, Check, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FeeLineItems } from "@/components/ui/fee-line-items";
import { quoteSendFee } from "@/lib/fees";
import { usePilotStore } from "@/store/pilot-store";
import { executeSend } from "@/lib/client-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Live USDC payment request + pay on Arc Testnet.
 */
export function QrPayCard({ embedded = false }: { embedded?: boolean }) {
  const {
    walletAddress,
    addTransaction,
    setActiveTx,
    setThinking,
    executionMode,
  } = usePilotStore();
  const [amount, setAmount] = useState("10");
  const [memo, setMemo] = useState("AGFusion pay");
  const [payTo, setPayTo] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fee = quoteSendFee(amount);
  const mode = executionMode();

  const recipient = (payTo.trim() || walletAddress || "").trim();

  const payUri = useMemo(() => {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://agfusion.vercel.app";
    const q = new URLSearchParams({
      amount,
      token: "USDC",
      chain: "Arc_Testnet",
      memo,
    });
    if (walletAddress) q.set("to", walletAddress);
    return `${base}/dashboard?pay=${encodeURIComponent(q.toString())}`;
  }, [amount, memo, walletAddress]);

  const qrImg = useMemo(() => {
    const data = encodeURIComponent(payUri);
    return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${data}`;
  }, [payUri]);

  async function copyUri() {
    await navigator.clipboard.writeText(payUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function payNow() {
    setError(null);
    if (!walletAddress) {
      setError("Connect Rabby first.");
      return;
    }
    if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      setError("Enter a valid 0x recipient (or leave empty to pay yourself).");
      return;
    }
    setBusy(true);
    setThinking(true);
    setConfirm(false);
    try {
      const tx = await executeSend({
        amount,
        token: "USDC",
        chain: "Arc_Testnet",
        recipient,
        recipientLabel: memo || "QR pay",
        preferLive: true,
      });
      addTransaction(tx);
      setActiveTx(tx.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
      setThinking(false);
    }
  }

  const body = (
        <div className="space-y-3">
          {!embedded && (
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Create a live USDC request on Arc. Share the link/QR, or pay a
            recipient from this wallet (opens Rabby to sign).
          </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 uppercase">
                Amount
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase">Memo</label>
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">
              Pay to (0x… · blank = yourself)
            </label>
            <Input
              className="font-mono text-xs"
              placeholder={walletAddress || "0x…"}
              value={payTo}
              onChange={(e) => setPayTo(e.target.value)}
            />
          </div>

          <div className="flex justify-center py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrImg}
              alt="Payment QR"
              width={160}
              height={160}
              className="rounded-xl border border-white/10 bg-white p-2"
            />
          </div>

          <p className="text-[10px] font-mono text-slate-500 break-all line-clamp-2">
            {payUri}
          </p>

          <FeeLineItems quote={fee} compact />

          {error && (
            <p className="text-[11px] text-red-300/90 leading-relaxed">{error}</p>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => void copyUri()}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={!walletAddress || busy}
              onClick={() => setConfirm(true)}
            >
              <Wallet className="h-3.5 w-3.5" />
              {busy ? "Opening wallet…" : "Pay now"}
            </Button>
          </div>
          {!walletAddress && (
            <p className="text-[10px] text-amber-200/80">
              Connect wallet to send live USDC on Arc.
            </p>
          )}
        </div>
  );

  return (
    <>
      {embedded ? (
        body
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <QrCode className="h-4 w-4 text-cyan-400" />
              QR / request pay
            </CardTitle>
          </CardHeader>
          <CardContent>{body}</CardContent>
        </Card>
      )}
      <ConfirmDialog
        open={confirm}
        title="Confirm live payment"
        summary={`Send ${amount} USDC on Arc to ${recipient.slice(0, 10)}… (${memo}). Rabby will ask you to sign.`}
        feeQuote={fee}
        mode={mode}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void payNow()}
      />
    </>
  );
}
