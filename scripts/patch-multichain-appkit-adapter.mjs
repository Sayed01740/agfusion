import fs from "node:fs";
import path from "node:path";

const adapterFile = path.resolve("src/sdk/wallet-adapter.ts");
let adapterSource = fs.readFileSync(adapterFile, "utf8");

// App Kit's adapter capability schema is NOT viem Chain objects. It expects
// capability descriptors shaped as { type: "evm", chainId: number }.
// The previous patch inserted viem Chain objects here, which caused the
// browser error: Invalid createViemAdapterFromProviderParams ... expected "evm";
// chainId: Required.
const multichainCapabilities = `capabilities: {
        addressContext: "user-controlled",
        supportedChains: [
          { type: "evm", chainId: 5042002 },
          { type: "evm", chainId: 84532 },
          { type: "evm", chainId: 11155111 },
          { type: "evm", chainId: 421614 },
          { type: "evm", chainId: 11155420 },
          { type: "evm", chainId: 80002 },
          { type: "evm", chainId: 43113 },
          { type: "evm", chainId: 1301 },
          { type: "evm", chainId: 59141 },
          { type: "evm", chainId: 57054 },
        ],
      },`;

// Replace any existing supportedChains capability block, regardless of
// whether the previous build patch inserted Arc-only or viem Chain objects.
const capabilityBlock = /capabilities:\s*\{\s*addressContext:\s*["']user-controlled["'],\s*supportedChains:\s*\[[\s\S]*?\],\s*\},/m;
if (capabilityBlock.test(adapterSource)) {
  adapterSource = adapterSource.replace(capabilityBlock, multichainCapabilities);
} else {
  throw new Error("Multichain App Kit patch: supported-chain capability block not found.");
}

const requiredChainIds = [5042002,84532,11155111,421614,11155420,80002,43113,1301,59141,57054];
const hasMultichain = requiredChainIds.every((id) =>
  adapterSource.includes(`{ type: "evm", chainId: ${id} }`),
);
if (!hasMultichain) throw new Error("Multichain App Kit patch incomplete: capability descriptors missing.");
fs.writeFileSync(adapterFile, adapterSource);
console.log("[AGFusion] App Kit adapter patched with valid EVM capability descriptors");

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
