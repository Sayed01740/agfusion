import { NextResponse } from "next/server";
import { enforceAgentSpendingPolicy, type AgentSpendAction } from "@/lib/agent-spending-policy";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<AgentSpendAction>(["bridge", "swap", "send", "route", "unified_spend", "x402"]);

export async function POST(req: Request) {
  const rl = rateLimit(`agent-policy-check:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 20,
  });
  if (!rl.ok) {
    return NextResponse.json({ allowed: false, reason: "rate_limited" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const action = String(body?.action || "") as AgentSpendAction;
    const amount = String(body?.amount || "");
    if (!ACTIONS.has(action)) return NextResponse.json({ allowed: false, reason: "Unsupported agent spending action." }, { status: 400 });

    const walletAddress = String(body?.smartAccountAddress || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { allowed: false, reason: "A valid smart account address is required for an agent policy check." },
        { status: 400 },
      );
    }
    const operationId = String(body?.operationId || `check_${walletAddress.toLowerCase()}_${Date.now()}`);
    if (operationId.length > 128 || !/^[a-zA-Z0-9:_-]+$/.test(operationId)) {
      return NextResponse.json(
        { allowed: false, reason: "Invalid operation ID." },
        { status: 400 },
      );
    }
    // This endpoint is explicitly the agent-policy gate. Do not let a caller
    // omit an address and get the non-agent exemption from a client-supplied
    // Boolean; all requests here must pass through the spending limits.
    const decision = await enforceAgentSpendingPolicy({
      walletAddress,
      amount,
      action,
      recipient: body?.recipient ? String(body.recipient) : undefined,
      isAgent: true,
      operationId,
    });

    return NextResponse.json(decision, { status: decision.allowed ? 200 : 403 });
  } catch (error) {
    return NextResponse.json({ allowed: false, reason: error instanceof Error ? error.message : "Agent policy check failed." }, { status: 500 });
  }
}
