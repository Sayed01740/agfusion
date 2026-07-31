"use client";

import { create } from "zustand";
import type {
  ChatMessage,
  ExecutionMode,
  TransactionRecord,
  UnifiedBalanceSnapshot,
} from "@/types";
import { emptyBalanceSnapshot } from "@/lib/balances-empty";
import { welcomeMessage } from "@/ai/orchestrator";
import {
  loadTransactions,
  mergeTransactions,
  saveTransactions,
} from "@/lib/persistence";

interface PilotState {
  messages: ChatMessage[];
  transactions: TransactionRecord[];
  balances: UnifiedBalanceSnapshot;
  activeTxId: string | null;
  isThinking: boolean;
  /** Always false — final build is live-only */
  forceDemo: boolean;
  walletAddress: string | null;
  walletChainId: number | null;
  liveBalanceUsdc: string | null;
  hydrated: boolean;
  authenticated: boolean;
  developerMode: boolean;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  addTransaction: (tx: TransactionRecord) => void;
  updateTransaction: (id: string, patch: Partial<TransactionRecord>) => void;
  setActiveTx: (id: string | null) => void;
  setThinking: (v: boolean) => void;
  setWallet: (address: string | null, chainId?: number | null) => void;
  setLiveBalance: (v: string | null) => void;
  setForceDemo: (v: boolean) => void;
  setAuthenticated: (v: boolean) => void;
  setDeveloperMode: (v: boolean) => void;
  loadServerTransactions: (wallet?: string) => Promise<void>;
  refreshBalances: () => void;
  resetChat: () => void;
  markPreviewExecuted: (messageId: string) => void;
  hydrate: () => void;
  executionMode: () => ExecutionMode;
}

export const usePilotStore = create<PilotState>((set, get) => ({
  messages: [welcomeMessage()],
  transactions: [],
  balances: emptyBalanceSnapshot(),
  activeTxId: null,
  isThinking: false,
  forceDemo: false,
  walletAddress: null,
  walletChainId: null,
  liveBalanceUsdc: null,
  hydrated: false,
  authenticated: false,
  developerMode: false,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  setMessages: (msgs) => set({ messages: msgs }),

  addTransaction: (tx) =>
    set((s) => {
      const record = {
        ...tx,
        executionMode: (tx.executionMode || "live") as "live" | "demo",
      };
      const transactions = [
        record,
        ...s.transactions.filter((t) => t.id !== record.id),
      ];
      // Always persist to localStorage so Analytics + activity work without SIWE/DB
      saveTransactions(transactions);
      const wallet = s.walletAddress;
      void fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: record.id,
          type: record.type,
          status: record.status,
          amount: record.amount,
          token: record.token,
          tokenOut: record.tokenOut,
          fromChain: record.fromChain,
          toChain: record.toChain,
          recipient: record.recipient,
          recipientLabel: record.recipientLabel,
          feeUsd: record.feeUsd,
          txHash: record.txHash,
          explorerUrl: record.explorerUrl,
          executionMode: record.executionMode || "live",
          message: record.message,
          stepsJson: JSON.stringify(record.steps || []),
          walletAddress: wallet || undefined,
        }),
      }).catch(() => {});
      return { transactions, activeTxId: record.id };
    }),

  updateTransaction: (id, patch) =>
    set((s) => {
      const transactions = s.transactions.map((t) =>
        t.id === id ? { ...t, ...patch } : t,
      );
      saveTransactions(transactions);
      return { transactions };
    }),

  setActiveTx: (id) => set({ activeTxId: id }),
  setThinking: (v) => set({ isThinking: v }),
  setWallet: (address, chainId = null) =>
    set({
      walletAddress: address,
      walletChainId: chainId ?? null,
    }),
  setLiveBalance: (v) => set({ liveBalanceUsdc: v }),
  setForceDemo: () => set({ forceDemo: false }),
  setAuthenticated: (v) => set({ authenticated: v }),
  setDeveloperMode: (v) => set({ developerMode: v }),
  loadServerTransactions: async (wallet) => {
    try {
      const q = wallet ? `?address=${encodeURIComponent(wallet)}` : "";
      const res = await fetch(`/api/transactions${q}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const list = (data.transactions || []) as TransactionRecord[];
      if (!list.length) return;
      set((s) => {
        const merged = mergeTransactions(s.transactions, list);
        saveTransactions(merged);
        return { transactions: merged };
      });
    } catch {
      /* ignore */
    }
  },
  refreshBalances: () => {
    const addr = get().walletAddress;
    const live = get().liveBalanceUsdc;
    if (addr || live) {
      const n = Number(String(live || "0").replace(/,/g, ""));
      const amount = Number.isFinite(n) ? n : 0;
      set({
        balances: {
          totalUsd: amount,
          balances: [
            {
              chain: "Arc_Testnet",
              chainLabel: "Arc Testnet",
              token: "USDC",
              amount,
              usdValue: amount,
              color: "#22d3ee",
            },
          ],
          updatedAt: new Date().toISOString(),
        },
      });
      if (addr) {
        void fetch(`/api/balances?address=${encodeURIComponent(addr)}`, {
          cache: "no-store",
        })
          .then((r) => r.json())
          .then((data) => {
            const row = data?.balances?.[0];
            const amt = Number(row?.amount ?? data?.totalUsd ?? 0);
            if (!Number.isFinite(amt)) return;
            set({
              liveBalanceUsdc: String(amt),
              balances: {
                totalUsd: amt,
                balances: [
                  {
                    chain: "Arc_Testnet",
                    chainLabel: "Arc Testnet",
                    token: "USDC",
                    amount: amt,
                    usdValue: amt,
                    color: "#22d3ee",
                  },
                ],
                updatedAt: new Date().toISOString(),
              },
            });
          })
          .catch(() => {});
      }
      return;
    }
    // No wallet: show zeros — never seed fake multi-chain demo balances
    set({ balances: emptyBalanceSnapshot() });
  },
  resetChat: () => set({ messages: [welcomeMessage()] }),

  markPreviewExecuted: (messageId) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId && m.actionPreview
          ? {
              ...m,
              actionPreview: { ...m.actionPreview, executed: true },
            }
          : m,
      ),
    })),

  hydrate: () => {
    if (get().hydrated) return;
    try {
      window.sessionStorage?.removeItem("agfusion_force_demo");
      window.sessionStorage?.removeItem("AGFusion_force_demo");
      window.sessionStorage?.removeItem("arcpilot_force_demo");
    } catch {
      /* ignore */
    }
    const stored = loadTransactions().filter((t) => t.executionMode !== "demo");
    set({
      transactions: stored,
      hydrated: true,
      forceDemo: false,
    });
  },

  executionMode: () => "live",
}));
