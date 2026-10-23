import { NextResponse } from "next/server";
import { enforceAgentSpendingPolicy, type AgentSpendAction } from "@/lib/agent-spending-policy";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

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
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ allowed: false, reason: "authentication_required" }, { status: 401 });
    }

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
    // A syntactically valid address is not proof of ownership. Bind this public
    // policy endpoint to the authenticated SIWE session and reject attempts to
    // reserve budget against another wallet. Smart-account identities require
    // a trusted server-side owner mapping and are intentionally not inferred
    // from a client-supplied address here.
    if (walletAddress.toLowerCase() !== session.address.toLowerCase()) {
      return NextResponse.json(
        { allowed: false, reason: "wallet_session_mismatch" },
        { status: 403 },
      );
    }

    // This endpoint is explicitly the agent-policy gate. Every request passes
    // through spending limits and uses the authenticated wallet identity.
    const decision = await enforceAgentSpendingPolicy({
      walletAddress: session.address,
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
