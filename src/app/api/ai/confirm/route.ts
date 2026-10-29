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

const previewSchema = z.record(z.string(), z.unknown()).refine(
  (preview) => Object.keys(preview).length <= 40 && JSON.stringify(preview).length <= 8 * 1024,
  "Preview is too large",
);
const bodySchema = z.object({
  mode: z.enum(["issue", "consume"]).optional(),
  confirmToken: z.string().max(200).optional(),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  preview: previewSchema,
});

/**
 * Confirmation capability endpoint.
 *
 * Local planning may build an action preview, but it cannot mint its own
 * confirmation capability. The server signs a short-lived capability for
 * the exact preview and the connected session wallet. The client consumes
 * that capability immediately before opening the wallet.
 */
export async function POST(req: Request) {
  const bodyResult = await readLimitedJson(req, 16 * 1024);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { ok: false, error: bodyResult.reason === "too_large" ? "request_too_large" : "invalid_json" },
      { status: bodyResult.reason === "too_large" ? 413 : 400 },
    );
  }

  const parsed = bodySchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  try {
    const body = parsed.data;
    const session = await getSessionUser();
    const bodyWallet = body.wallet?.toLowerCase();
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
            message: "Connect the wallet used for this transaction before confirming.",
          },
          { status: 401 },
        );
      }

      const confirmToken = issueConfirmationToken({ wallet, action: { preview } });
      return NextResponse.json({ ok: true, confirmToken });
    }

    if (!body.confirmToken) {
      return NextResponse.json({ ok: false, error: "confirmation_required" }, { status: 400 });
    }

    const valid = consumeConfirmationToken({
      token: body.confirmToken,
      wallet,
      action: { preview },
    });

    if (!valid) {
      return NextResponse.json(
        {
          ok: false,
          error: "confirmation_expired",
          message: "This confirmation is expired, already used, or does not match the reviewed transaction. Re-plan the transaction.",
        },
        { status: 403 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "confirmation_failed" }, { status: 400 });
  }
}
