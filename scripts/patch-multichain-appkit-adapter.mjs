import fs from "node:fs";
import path from "node:path";

const adapterFile = path.resolve("src/sdk/wallet-adapter.ts");
let adapterSource = fs.readFileSync(adapterFile, "utf8");

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
const arcOnlyBlock = /capabilities:\s*\{\s*addressContext:\s*["']user-controlled["'],\s*supportedChains:\s*\[\s*ArcTestnet\s*\],\s*\},/g;
const matches = adapterSource.match(arcOnlyBlock)?.length ?? 0;
if (matches > 0) {
  adapterSource = adapterSource.replace(arcOnlyBlock, multichainCapabilities);
} else if (!adapterSource.includes("supportedChains: [\n          ArcTestnet,")) {
  throw new Error("Multichain App Kit patch: no supported-chain capability block found.");
}
const hasMultichain = ["baseSepolia","arbitrumSepolia","optimismSepolia","polygonAmoy","avalancheFuji","unichainSepolia","lineaSepolia"].every((x) => adapterSource.includes(x)) && adapterSource.includes("supportedChains: [\n          ArcTestnet,");
const remainingArcOnly = (adapterSource.match(/supportedChains:\s*\[\s*ArcTestnet\s*\]/g) || []).length;
if (!hasMultichain || remainingArcOnly > 0) throw new Error(`Multichain App Kit patch incomplete: hasMultichain=${hasMultichain}, remainingArcOnly=${remainingArcOnly}`);
fs.writeFileSync(adapterFile, adapterSource);
console.log("[AGFusion] App Kit adapter patched for multichain capabilities");

const serviceFile = path.resolve("src/blockchain/appkit-service.ts");
let serviceSource = fs.readFileSync(serviceFile, "utf8");
const directImport = 'import { runBridgeKitFlow, runBridgeKitRecovery } from "@/blockchain/bridge-kit-service";';
const oldDirectImport = 'import { runBridgeKitFlow } from "@/blockchain/bridge-kit-service";';
if (!serviceSource.includes(directImport)) {
  if (serviceSource.includes(oldDirectImport)) serviceSource = serviceSource.replace(oldDirectImport, directImport);
  else {
    const anchor = 'import { liveSendUsdcOnArc } from "@/blockchain/live-send";';
    if (!serviceSource.includes(anchor)) throw new Error("Permanent bridge patch: import anchor not found.");
    serviceSource = serviceSource.replace(anchor, `${anchor}\n${directImport}`);
  }
}

const functionMarker = "async function tryLiveAppKitBridge(params: {";
const guardMarker = "PERMANENT-CCTP-BRIDGE-GUARD";
if (!serviceSource.includes(functionMarker)) throw new Error("Permanent bridge patch: tryLiveAppKitBridge() not found.");
if (!serviceSource.includes(guardMarker)) {
  const signatureEnd = serviceSource.indexOf("): Promise<TransactionRecord> {", serviceSource.indexOf(functionMarker));
  if (signatureEnd < 0) throw new Error("Permanent bridge patch: tryLiveAppKitBridge() signature boundary not found.");
  const insertionPoint = signatureEnd + "): Promise<TransactionRecord> {".length;
  const guard = `\n  // ${guardMarker}\n  // App Kit must never execute a bridge. Use the direct Circle CCTP v2\n  // Forwarding Service, which validates source/destination explicitly.\n  return runBridgeKitFlow({\n    amount: params.amount,\n    fromChain: params.fromChain,\n    toChain: params.toChain,\n    txId: params.txId,\n    recipient: params.recipient,\n    failedResult: params.previousResult,\n  });\n`;
  serviceSource = serviceSource.slice(0, insertionPoint) + guard + serviceSource.slice(insertionPoint);
}

// Recovery was a second App Kit bridge path. Disable it too, otherwise
// kit.retryBridge() can still produce the same Invalid chain error.
const recoveryMarker = "export async function runBridgeWithRecovery(params: {";
const recoveryGuard = "PERMANENT-CCTP-RECOVERY-GUARD";
if (!serviceSource.includes(recoveryMarker)) throw new Error("Permanent bridge patch: runBridgeWithRecovery() not found.");
if (!serviceSource.includes(recoveryGuard)) {
  const start = serviceSource.indexOf(recoveryMarker);
  const end = serviceSource.indexOf("async function resumeFromBurn(", start);
  const signatureEnd = serviceSource.indexOf("): Promise<TransactionRecord> {", start);
  if (end < 0 || signatureEnd < 0 || signatureEnd > end) throw new Error("Permanent bridge patch: recovery boundaries not found.");
  const signature = serviceSource.slice(start, signatureEnd + "): Promise<TransactionRecord> {".length);
  const replacement = `${signature}\n  // ${recoveryGuard}\n  return runBridgeKitRecovery({\n    amount: params.amount,\n    fromChain: params.fromChain,\n    toChain: params.toChain,\n    recipient: params.recipient,\n    failedTx: params.failedTx,\n    txId: params.txId,\n  });\n}\n\n`;
  serviceSource = serviceSource.slice(0, start) + replacement + serviceSource.slice(end);
}

const guardCount = (serviceSource.match(/PERMANENT-CCTP-BRIDGE-GUARD/g) || []).length;
const recoveryGuardCount = (serviceSource.match(/PERMANENT-CCTP-RECOVERY-GUARD/g) || []).length;
if (guardCount !== 1 || recoveryGuardCount !== 1 || !serviceSource.includes("runBridgeKitFlow") || !serviceSource.includes("runBridgeKitRecovery")) {
  throw new Error(`Permanent bridge patch incomplete: bridge=${guardCount}, recovery=${recoveryGuardCount}`);
}
fs.writeFileSync(serviceFile, serviceSource);
console.log("[AGFusion] All bridge and bridge-recovery execution locked to direct Circle CCTP v2");
