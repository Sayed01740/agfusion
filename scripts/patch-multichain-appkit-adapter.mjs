import fs from "node:fs";
import path from "node:path";

const adapterFile = path.resolve("src/sdk/wallet-adapter.ts");
let adapterSource = fs.readFileSync(adapterFile, "utf8");

// IMPORTANT: createViemAdapterFromProvider() already accepts a browser
// EIP-1193 provider and the documented browser integration does not pass a
// capabilities object. Previous AGFusion patches injected supportedChains
// into the adapter. That created the runtime schema error shown in the UI
// and also incorrectly made the adapter itself responsible for chain support.
// Chain support belongs to the bridge operation + the source-chain switch.
// Remove ALL generated capability blocks so the adapter stays a plain,
// provider-backed Viem adapter for every EVM chain.
const capabilityBlock = /capabilities:\s*\{\s*addressContext:\s*["']user-controlled["'],\s*supportedChains:\s*\[[\s\S]*?\],\s*\},/m;
const beforeCapabilityRemoval = adapterSource;
if (capabilityBlock.test(adapterSource)) {
  adapterSource = adapterSource.replace(capabilityBlock, "");
}

if (/capabilities:\s*\{\s*addressContext:\s*["']user-controlled["'],\s*supportedChains:/m.test(adapterSource)) {
  throw new Error("Permanent adapter patch failed: supportedChains capability block remains.");
}

if (adapterSource === beforeCapabilityRemoval && /supportedChains:\s*\[/m.test(adapterSource)) {
  throw new Error("Permanent adapter patch refused: an unexpected supportedChains block exists and was not removed.");
}

fs.writeFileSync(adapterFile, adapterSource);
console.log("[AGFusion] App Kit browser adapter normalized: no unsupported capabilities block");

// Bridge execution is permanently routed through the direct Circle CCTP v2
// Forwarding Service. This keeps every configured EVM source/destination on
// the same tested bridge path and avoids App Kit adapter chain-schema issues.
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
  const guard = `\n  // ${guardMarker}\n  // App Kit bridge execution is disabled here. Use the direct Circle CCTP v2\n  // Forwarding Service, which explicitly validates both configured chains.\n  return runBridgeKitFlow({\n    amount: params.amount,\n    fromChain: params.fromChain,\n    toChain: params.toChain,\n    txId: params.txId,\n    recipient: params.recipient,\n    failedResult: params.previousResult,\n  });\n`;
  serviceSource = serviceSource.slice(0, insertionPoint) + guard + serviceSource.slice(insertionPoint);
}

// Recovery must use the same direct CCTP implementation so retry never falls
// back to the broken App Kit adapter path.
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

// TypeScript 5.8 correctly narrows a local const across the guarded call,
// while the older property-access form can remain string | undefined here.
const legacyStateRestore = /if \(!bState && params\.txId\) \{\s*bState = loadBridgeState\(params\.txId\);\s*\}/m;
if (legacyStateRestore.test(serviceSource)) {
  serviceSource = serviceSource.replace(
    legacyStateRestore,
    'const persistedTxId = params.txId;\n    if (!bState && persistedTxId) {\n      bState = loadBridgeState(persistedTxId);\n    }',
  );
}

fs.writeFileSync(serviceFile, serviceSource);
console.log("[AGFusion] All bridge and bridge-recovery execution locked to direct Circle CCTP v2");
