import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// 1. App Kit must advertise every EVM testnet used by AGFusion.
// ---------------------------------------------------------------------------
const adapterFile = path.resolve("src/sdk/wallet-adapter.ts");
let adapterSource = fs.readFileSync(adapterFile, "utf8");

// App Kit's viem adapter validates bridge source/destination chains against
// capabilities.supportedChains. The previous Arc-only capability was the
// direct cause of: "Invalid chain ''. Not supported by this adapter. It
// supports 1 chain: Arc Testnet."
const oldImport = 'import { ArcTestnet } from "@circle-fin/app-kit/chains";';
const multichainImport = `import { ArcTestnet } from "@circle-fin/app-kit/chains";
import {
  baseSepolia,
  arbitrumSepolia,
  optimismSepolia,
  polygonAmoy,
  avalancheFuji,
  unichainSepolia,
  lineaSepolia,
} from "viem/chains";`;

if (adapterSource.includes(oldImport) && !adapterSource.includes("baseSepolia")) {
  adapterSource = adapterSource.replace(oldImport, multichainImport);
}

const multichainCapabilities = `capabilities: {
        addressContext: "user-controlled",
        supportedChains: [
          ArcTestnet,
          baseSepolia,
          arbitrumSepolia,
          optimismSepolia,
          polygonAmoy,
          avalancheFuji,
          unichainSepolia,
          lineaSepolia,
        ],
      },`;

// Replace every Arc-only capability block, including blocks added later.
const arcOnlyBlock = /capabilities:\s*\{\s*addressContext:\s*["']user-controlled["'],\s*supportedChains:\s*\[\s*ArcTestnet\s*\],\s*\},/g;
const matches = adapterSource.match(arcOnlyBlock)?.length ?? 0;
if (matches > 0) {
  adapterSource = adapterSource.replace(arcOnlyBlock, multichainCapabilities);
} else if (!adapterSource.includes("supportedChains: [\n          ArcTestnet,")) {
  throw new Error("Multichain App Kit patch: no supported-chain capability block found.");
}

const hasMultichain =
  adapterSource.includes("baseSepolia") &&
  adapterSource.includes("arbitrumSepolia") &&
  adapterSource.includes("optimismSepolia") &&
  adapterSource.includes("polygonAmoy") &&
  adapterSource.includes("avalancheFuji") &&
  adapterSource.includes("unichainSepolia") &&
  adapterSource.includes("lineaSepolia") &&
  adapterSource.includes("supportedChains: [\n          ArcTestnet,");

const remainingArcOnly = (adapterSource.match(/supportedChains:\s*\[\s*ArcTestnet\s*\]/g) || []).length;
if (!hasMultichain || remainingArcOnly > 0) {
  throw new Error(
    `Multichain App Kit patch incomplete: hasMultichain=${hasMultichain}, remainingArcOnly=${remainingArcOnly}`,
  );
}

fs.writeFileSync(adapterFile, adapterSource);
console.log("[AGFusion] App Kit adapter patched: Arc + Base + Arbitrum + Optimism + Polygon + Avalanche + Unichain + Linea");

// ---------------------------------------------------------------------------
// 2. Permanent bridge execution guard.
//
// The App Kit bridge path has historically produced the fatal empty-chain
// error even after the adapter advertised all supported chains. AGFusion
// already has a direct Circle CCTP v2 Forwarding Service implementation in
// src/blockchain/bridge-kit-service.ts which performs explicit source-chain
// validation, approval, burn, Iris forwarding and destination receipt
// verification. It must be the single live bridge execution path.
//
// We enforce that at build time so a future App Kit refactor cannot silently
// re-enable the broken kit.bridge() path.
// ---------------------------------------------------------------------------
const serviceFile = path.resolve("src/blockchain/appkit-service.ts");
let serviceSource = fs.readFileSync(serviceFile, "utf8");

const directImport = 'import { runBridgeKitFlow } from "@/blockchain/bridge-kit-service";';
if (!serviceSource.includes(directImport)) {
  const anchor = 'import { liveSendUsdcOnArc } from "@/blockchain/live-send";';
  if (!serviceSource.includes(anchor)) {
    throw new Error("Permanent bridge patch: appkit-service import anchor not found.");
  }
  serviceSource = serviceSource.replace(anchor, `${anchor}\n${directImport}`);
}

const functionMarker = "async function tryLiveAppKitBridge(params: {";
const guardMarker = "  // PERMANENT-CCTP-BRIDGE-GUARD";
if (!serviceSource.includes(functionMarker)) {
  throw new Error("Permanent bridge patch: tryLiveAppKitBridge() not found.");
}

if (!serviceSource.includes(guardMarker)) {
  const guard = `  ${guardMarker}\n  // Do not call kit.bridge(). The direct CCTP v2 Forwarding Service is the\n  // canonical live bridge path and is independently chain-validated.\n  // This guard prevents the historical \"Invalid chain ''\" App Kit path\n  // from ever reaching a wallet or creating a duplicate burn.\n  return runBridgeKitFlow({\n    amount: params.amount,\n    fromChain: params.fromChain,\n    toChain: params.toChain,\n    txId: params.txId,\n    recipient: params.recipient,\n    failedResult: params.previousResult,\n  });\n\n`;
  serviceSource = serviceSource.replace(functionMarker, `${functionMarker}\n${guard}`);
}

const guardCount = (serviceSource.match(/PERMANENT-CCTP-BRIDGE-GUARD/g) || []).length;
const importCount = (serviceSource.match(/runBridgeKitFlow/g) || []).length;
if (guardCount !== 1 || importCount < 2) {
  throw new Error(
    `Permanent bridge patch incomplete: guardCount=${guardCount}, runBridgeKitFlowReferences=${importCount}`,
  );
}

fs.writeFileSync(serviceFile, serviceSource);
console.log("[AGFusion] Permanent bridge guard installed: appkit-service -> direct Circle CCTP v2");
