import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { consumeConfirmationToken } from "@/lib/confirmation-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      confirmToken?: string;
      preview?: Record<string, unknown>;
    };
    const session = await getSessionUser();
    if (!body.confirmToken || !body.preview) {
      return NextResponse.json({ ok: false, error: "confirmation_required" }, { status: 400 });
    }

    const preview = { ...body.preview };
    delete preview.confirmToken;

    const valid = consumeConfirmationToken({
      token: body.confirmToken,
      wallet: session?.address,
      action: { preview },
    });

    if (!valid) {
      return NextResponse.json(
        { ok: false, error: "confirmation_expired", message: "This confirmation is expired or already used. Re-plan the transaction." },
        { status: 403 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "confirmation_failed" }, { status: 400 });
  }
}
