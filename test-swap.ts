import { getServerKitKey } from "./src/lib/circle-kit-server";

async function testSwap() {
  const kitKey = getServerKitKey();
  if (!kitKey) {
    console.error("No KIT_KEY");
    process.exit(1);
  }

  const res = await fetch("https://api.circle.com/v1/stablecoinKits/swap", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${kitKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: { chain: "Arc_Testnet", address: "0x1234567890123456789012345678901234567890" },
      tokenIn: "USDC",
      tokenOut: "EURC",
      amountIn: "50"
    })
  });
  
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Body:", text);
}

testSwap();
