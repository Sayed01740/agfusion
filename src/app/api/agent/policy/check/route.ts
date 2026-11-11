import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceAgentSpendingPolicy, type AgentSpendAction } from "@/lib/agent-spending-policy";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";
import { readLimitedJson } from "@/lib/read-limited-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["bridge", "swap", "send", "route", "unified_spend", "x402"]),
  amount: z.union([z.string().max(128), z.number().finite()]).transform(String),
  smartAccountAddress: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/),
  operationId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9:_-]+$/).optional(),
  recipient: z.string().max(256).optional(),
});

export async function POST(req: Request) {
  const rl = rateLimit(`agent-policy-check:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 20,
  });
  if (!rl.ok) {
    return NextResponse.json({ allowed: false, reason: "rate_limited" }, { status: 429 });
  }

  const limited = await readLimitedJson(req, 8 * 1024);
  if (!limited.ok) {
    return NextResponse.json(
      { allowed: false, reason: limited.error },
      { status: limited.status },
    );
  }

  const parsed = bodySchema.safeParse(limited.value);
  if (!parsed.success) {
    return NextResponse.json(
      { allowed: false, reason: "invalid_request" },
      { status: 400 },
    );
  }

  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ allowed: false, reason: "authentication_required" }, { status: 401 });
    }

    const body = parsed.data;
    const action = body.action as AgentSpendAction;
    const amount = body.amount;
    const walletAddress = body.smartAccountAddress;
    const operationId = body.operationId || `check_${walletAddress.toLowerCase()}_${Date.now()}`;

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
      recipient: body.recipient || undefined,
      isAgent: true,
      operationId,
    });

    return NextResponse.json(decision, { status: decision.allowed ? 200 : 403 });
  } catch (error) {
    return NextResponse.json({ allowed: false, reason: error instanceof Error ? error.message : "Agent policy check failed." }, { status: 500 });
  }
}
