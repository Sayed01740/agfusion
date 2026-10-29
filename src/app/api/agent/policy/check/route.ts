import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceAgentSpendingPolicy, type AgentSpendAction } from "@/lib/agent-spending-policy";
import { readLimitedJson } from "@/lib/read-limited-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["bridge", "swap", "send", "route", "unified_spend", "x402"] as const satisfies readonly AgentSpendAction[];
const bodySchema = z.object({
  action: z.enum(ACTIONS),
  amount: z.string().min(1).max(64),
  smartAccountAddress: z.string().max(42).optional(),
  operationId: z.string().max(128).optional(),
  recipient: z.string().max(128).optional(),
});

export async function POST(req: Request) {
  const bodyResult = await readLimitedJson(req, 8 * 1024);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { allowed: false, reason: bodyResult.reason === "too_large" ? "Request body too large." : "Invalid JSON request body." },
      { status: bodyResult.reason === "too_large" ? 413 : 400 },
    );
  }

  const parsed = bodySchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return NextResponse.json({ allowed: false, reason: "Invalid request." }, { status: 400 });
  }

  try {
    const body = parsed.data;
    const action = body.action;
    const amount = body.amount;
    const walletAddress = body.smartAccountAddress || "";
    const isAgent = Boolean(body.smartAccountAddress);
    const operationId = body.operationId || `check_${walletAddress}_${Date.now()}`;
    const decision = await enforceAgentSpendingPolicy({
      walletAddress,
      amount,
      action,
      recipient: body.recipient || undefined,
      isAgent,
      operationId,
    });

    return NextResponse.json(decision, { status: decision.allowed ? 200 : 403 });
  } catch (error) {
    return NextResponse.json(
      { allowed: false, reason: error instanceof Error ? error.message : "Agent policy check failed." },
      { status: 500 },
    );
  }
}
