import { NextResponse } from "next/server";
import { getActiveWalletMeta } from "@/sdk/active-wallet";
import { enforceAgentSpendingPolicy, type AgentSpendAction } from "@/lib/agent-spending-policy";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<AgentSpendAction>(["bridge", "swap", "send", "route", "unified_spend", "x402"]);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body?.action || "") as AgentSpendAction;
    const amount = String(body?.amount || "");
    if (!ACTIONS.has(action)) return NextResponse.json({ allowed: false, reason: "Unsupported agent spending action." }, { status: 400 });

    const session = await getSessionUser();
    const meta = getActiveWalletMeta();
    const walletAddress = session?.address || meta?.address || meta?.smartAccountAddress || "";
    const isAgent = Boolean(meta?.smartAccountAddress);

    const decision = await enforceAgentSpendingPolicy({
      walletAddress,
      amount,
      action,
      recipient: body?.recipient ? String(body.recipient) : undefined,
      isAgent,
    });

    return NextResponse.json(decision, { status: decision.allowed ? 200 : 403 });
  } catch (error) {
    return NextResponse.json({ allowed: false, reason: error instanceof Error ? error.message : "Agent policy check failed." }, { status: 500 });
  }
}
