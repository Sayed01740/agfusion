import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import {
  consumeConfirmationToken,
  issueConfirmationToken,
} from "@/lib/confirmation-token";
import { readLimitedJson } from "@/lib/read-limited-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  mode: z.enum(["issue", "consume"]).optional(),
  confirmToken: z.string().min(1).max(2_048).optional(),
  wallet: z.string().max(42).optional(),
  preview: z.record(z.string(), z.unknown()),
});

function isBoundedJsonValue(
  value: unknown,
  depth = 0,
  budget = { nodes: 0 },
): boolean {
  budget.nodes += 1;
  if (depth > 8 || budget.nodes > 500) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= 4_096;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.length <= 100 && value.every((item) =>
      isBoundedJsonValue(item, depth + 1, budget),
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length <= 64 && entries.every(([key, item]) =>
      key.length <= 128 && isBoundedJsonValue(item, depth + 1, budget),
    );
  }
  return false;
}

/**
 * Confirmation capability endpoint.
 *
 * Local planning may build an action preview, but it cannot mint its own
 * confirmation capability. The server signs a short-lived capability for
 * the exact preview and the connected session wallet. The client consumes
 * that capability immediately before opening the wallet.
 */
export async function POST(req: Request) {
  const limited = await readLimitedJson(req, 32 * 1024);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: limited.error },
      { status: limited.status },
    );
  }

  const parsed = bodySchema.safeParse(limited.value);
  if (!parsed.success || !isBoundedJsonValue(parsed.data?.preview)) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 },
    );
  }

  try {
    const body = parsed.data;
    const session = await getSessionUser();
    const bodyWallet =
      typeof body.wallet === "string" &&
      /^0x[a-fA-F0-9]{40}$/i.test(body.wallet)
        ? body.wallet.toLowerCase()
        : undefined;
    const wallet = session?.address || bodyWallet;

    const preview = { ...body.preview };
    delete preview.confirmToken;
    delete preview.executed;

    if (body.mode === "issue") {
      if (!wallet) {
        return NextResponse.json(
          {
            ok: false,
            error: "wallet_session_required",
            message:
              "Connect the wallet used for this transaction before confirming.",
          },
          { status: 401 },
        );
      }

      const confirmToken = issueConfirmationToken({
        wallet,
        action: { preview },
      });

      return NextResponse.json({ ok: true, confirmToken });
    }

    if (!body.confirmToken) {
      return NextResponse.json(
        { ok: false, error: "confirmation_required" },
        { status: 400 },
      );
    }

    const valid = await consumeConfirmationToken({
      token: body.confirmToken,
      wallet,
      action: { preview },
    });

    if (!valid) {
      return NextResponse.json(
        {
          ok: false,
          error: "confirmation_expired",
          message:
            "This confirmation is expired, already used, or does not match the reviewed transaction. Re-plan the transaction.",
        },
        { status: 403 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "confirmation_failed" },
      { status: 400 },
    );
  }
}
