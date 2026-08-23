import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import {
  consumeConfirmationToken,
  issueConfirmationToken,
} from "@/lib/confirmation-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Confirmation capability endpoint.
 *
 * Local planning may build an action preview, but it cannot mint its own
 * confirmation capability. The server signs a short-lived capability for
 * the exact preview and the connected session wallet. The client consumes
 * that capability immediately before opening the wallet.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      mode?: "issue" | "consume";
      confirmToken?: string;
      preview?: Record<string, unknown>;
    };

    const session = await getSessionUser();
    const wallet = session?.address || undefined;

    if (!body.preview || typeof body.preview !== "object") {
      return NextResponse.json(
        { ok: false, error: "confirmation_required" },
        { status: 400 },
      );
    }

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
