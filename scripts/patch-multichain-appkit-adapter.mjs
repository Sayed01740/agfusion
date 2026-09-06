import fs from "node:fs";
import path from "node:path";

const adapterFile = path.resolve("src/sdk/wallet-adapter.ts");
let adapterSource = fs.readFileSync(adapterFile, "utf8");

const capabilityBlock = /capabilities:\s*\{\s*addressContext:\s*["']user-controlled["'],\s*supportedChains:\s*\[[\s\S]*?\],\s*\},/m;
const beforeCapabilityRemoval = adapterSource;
if (capabilityBlock.test(adapterSource)) adapterSource = adapterSource.replace(capabilityBlock, "");
if (/capabilities:\s*\{\s*addressContext:\s*["']user-controlled["'],\s*supportedChains:/m.test(adapterSource)) {
  throw new Error("Permanent adapter patch failed: supportedChains capability block remains.");
}
if (adapterSource === beforeCapabilityRemoval && /supportedChains:\s*\[/m.test(adapterSource)) {
  throw new Error("Permanent adapter patch refused: an unexpected supportedChains block exists and was not removed.");
}
fs.writeFileSync(adapterFile, adapterSource);
console.log("[AGFusion] App Kit browser adapter normalized: no unsupported capabilities block");

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

// The bridge source is legacy strict TypeScript. Normalize catch-variable
// message access in the transformed source so every catch remains valid with
// useUnknownInCatchVariables/strictNullChecks enabled.
serviceSource = serviceSource.replace(/\be\.message\b/g, "String(e)");

const functionMarker = "async function tryLiveAppKitBridge(params: {";
const recoveryMarker = "export async function runBridgeWithRecovery(params: {";
const functionStart = serviceSource.indexOf(functionMarker);
const recoveryStart = serviceSource.indexOf(recoveryMarker, functionStart);
if (functionStart < 0 || recoveryStart < 0 || recoveryStart <= functionStart) {
  throw new Error("Permanent bridge patch: bridge function boundaries not found.");
}

// IMPORTANT: do not leave the old App Kit implementation behind an early
// return. TypeScript still checks that dead body, which caused the repeated
// Vercel errors ('wired' nullable, catch variable unknown, etc.). Replace the
// entire obsolete function with the direct CCTP v2 implementation instead.
const directBridgeFunction = `async function tryLiveAppKitBridge(params: {\n  amount: string;\n  fromChain: ChainId;\n  toChain: ChainId;\n  onStep?: (steps: TxStep[]) => void;\n  bridgeState?: BridgeState | null;\n  previousResult?: unknown;\n  txId?: string;\n  recipient?: string;\n}): Promise<TransactionRecord> {\n  return runBridgeKitFlow({\n    amount: params.amount,\n    fromChain: params.fromChain,\n    toChain: params.toChain,\n    txId: params.txId,\n    recipient: params.recipient,\n    failedResult: params.previousResult,\n  });\n}\n\n`;
serviceSource = serviceSource.slice(0, functionStart) + directBridgeFunction + serviceSource.slice(recoveryStart);

const recoveryGuard = "PERMANENT-CCTP-RECOVERY-GUARD";
const recoveryEnd = serviceSource.indexOf("async function resumeFromBurn(", serviceSource.indexOf(recoveryMarker));
const recoverySignatureEnd = serviceSource.indexOf("): Promise<TransactionRecord> {", serviceSource.indexOf(recoveryMarker));
if (recoveryEnd < 0 || recoverySignatureEnd < 0 || recoverySignatureEnd > recoveryEnd) {
  throw new Error("Permanent bridge patch: recovery boundaries not found.");
}
const recoveryStartAfterBridge = serviceSource.indexOf(recoveryMarker);
const recoverySignature = serviceSource.slice(recoveryStartAfterBridge, recoverySignatureEnd + "): Promise<TransactionRecord> {".length);
const recoveryReplacement = `${recoverySignature}\n  // ${recoveryGuard}\n  return runBridgeKitRecovery({\n    amount: params.amount,\n    fromChain: params.fromChain,\n    toChain: params.toChain,\n    recipient: params.recipient,\n    failedTx: params.failedTx,\n    txId: params.txId,\n  });\n}\n\n`;
serviceSource = serviceSource.slice(0, recoveryStartAfterBridge) + recoveryReplacement + serviceSource.slice(recoveryEnd);

if (!serviceSource.includes("runBridgeKitFlow") || !serviceSource.includes("runBridgeKitRecovery")) {
  throw new Error("Permanent bridge patch incomplete: direct CCTP bridge functions missing.");
}
fs.writeFileSync(serviceFile, serviceSource);
console.log("[AGFusion] Bridge execution and recovery locked to direct Circle CCTP v2 without dead App Kit code");
