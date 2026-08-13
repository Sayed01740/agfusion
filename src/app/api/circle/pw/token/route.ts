import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const apiKey = process.env.CIRCLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "CIRCLE_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // In a production app, you would look up the userId associated with this email in your database.
    // For this demonstration, we'll derive a deterministic UUID from the email so the user gets the same wallet.
    // We use a simple hash of the email to create a UUID-like string.
    const { createHash } = await import("crypto");
    const hash = createHash("md5").update(email.toLowerCase()).digest("hex");
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
      console.log(`[Circle PW] Creating new user for userId: ${userId}`);
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
          { status: createRes.status }
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
        { status: response.status }
      );
    }

    return NextResponse.json({
      userToken: data.data.userToken,
      encryptionKey: data.data.encryptionKey,
      userId: userId,
    });
  } catch (error) {
    console.error("[Circle PW] API Route Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
