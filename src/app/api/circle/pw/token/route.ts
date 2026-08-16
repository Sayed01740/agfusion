import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getCircleApiKey, isValidEmail } from "@/lib/circle-pw-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(`circle-token:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 15,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isValidEmail(body.email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const apiKey = getCircleApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "CIRCLE_API_KEY is not configured" },
      { status: 500 },
    );
  }

  // userId is a deterministic *identifier* derived from the email so the same
  // person always gets the same Circle wallet. It is not a credential: Circle
  // still requires the wallet owner to approve every challenge with their PIN,
  // so deriving it from a known email grants no execution ability.
  const hash = createHash("md5").update(body.email.toLowerCase()).digest("hex");
  const userId = [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32),
  ].join("-");

  let response = await fetch("https://api.circle.com/v1/w3s/users/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ userId }),
  });

  let data = await response.json();

  // If user doesn't exist, create the user and try again
  if (!response.ok && data?.message?.includes("Cannot find the userId")) {
    const createRes = await fetch("https://api.circle.com/v1/w3s/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ userId }),
    });

    if (!createRes.ok) {
      const createData = await createRes.json();
      console.error("[Circle PW] Create User Error:", createData);
      return NextResponse.json(
        { error: createData.message || "Failed to create Circle user" },
        { status: createRes.status },
      );
    }

    // Retry token generation
    response = await fetch("https://api.circle.com/v1/w3s/users/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ userId }),
    });
    data = await response.json();
  }

  if (!response.ok) {
    console.error("[Circle PW] Token Error:", data);
    return NextResponse.json(
      { error: data.message || "Failed to generate Circle user token" },
      { status: response.status },
    );
  }

  return NextResponse.json({
    userToken: data.data.userToken,
    encryptionKey: data.data.encryptionKey,
    userId,
  });
}
