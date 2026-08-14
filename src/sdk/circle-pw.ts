import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import { type Address } from "viem";

let circleSdk: W3SSdk | null = null;

export async function getCircleSdk(): Promise<W3SSdk> {
  if (circleSdk) return circleSdk;
  
  circleSdk = new W3SSdk();
  const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID?.trim();
  if (appId) {
    circleSdk.setAppSettings({ appId });
  }
  return circleSdk;
}

export async function authenticateWithCircleEmail(email: string): Promise<string> {
  const sdk = await getCircleSdk();
  
  // 1. Fetch userToken and encryptionKey from our backend
  const res = await fetch("/api/circle/pw/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to authenticate with Circle");
  }

  // 2. Set authentication in the SDK
  sdk.setAuthentication({
    userToken: data.userToken,
    encryptionKey: data.encryptionKey,
  });

  // 3. Check if user already has a wallet
  const walletsRes = await fetch("/api/circle/pw/wallets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userToken: data.userToken }),
  });
  
  const walletsData = await walletsRes.json();
  if (walletsData.address) {
    return walletsData.address;
  }

  // 4. Loop up to 2 times (once for PIN setup if needed, once for Wallet creation)
  for (let i = 0; i < 2; i++) {
    const challengeRes = await fetch("/api/circle/pw/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userToken: data.userToken }),
    });

    const challengeData = await challengeRes.json();
    if (!challengeRes.ok) {
      throw new Error(challengeData.error || "Failed to create wallet challenge");
    }

    // Execute the challenge (Pops up Circle UI for OTP and PIN)
    await new Promise<void>((resolve, reject) => {
      sdk.execute(challengeData.challengeId, (error) => {
        if (error) {
          reject(new Error(error.message || "User cancelled or failed challenge"));
          return;
        }
        resolve();
      });
    });

    // Fetch the newly created wallet address
    const newWalletsRes = await fetch("/api/circle/pw/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userToken: data.userToken }),
    });
    
    const newWalletsData = await newWalletsRes.json();
    if (newWalletsData.address) {
      return newWalletsData.address;
    }
  }

  throw new Error("Finished challenges but wallet address could not be fetched.");
}
