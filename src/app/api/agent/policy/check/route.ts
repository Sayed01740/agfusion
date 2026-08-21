import { NextResponse } from "next/server";
import { enforceAgentSpendingPolicy, type AgentSpendAction } from "@/lib/agent-spending-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<AgentSpendAction>(["bridge", "swap", "send", "route", "unified_spend", "x402"]);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body?.action || "") as AgentSpendAction;
    const amount = String(body?.amount || "");
    if (!ACTIONS.has(action)) return NextResponse.json({ allowed: false, reason: "Unsupported agent spending action." }, { status: 400 });

    const walletAddress = String(body?.smartAccountAddress || "");
    const isAgent = Boolean(walletAddress);
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
