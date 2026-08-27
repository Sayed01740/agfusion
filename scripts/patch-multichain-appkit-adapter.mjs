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
fs.writeFileSync(serviceFile, serviceSource);
console.log("[AGFusion] All bridge and bridge-recovery execution locked to direct Circle CCTP v2");

// ---------------------------------------------------------------------------
// Production type/build compatibility checks
// ---------------------------------------------------------------------------
// TypeScript 5.8+ removed compilerOptions.baseUrl. Remove the obsolete option
// in the build workspace so both CI typecheck and Vercel use the same config.
const tsconfigFile = path.resolve("tsconfig.json");
if (fs.existsSync(tsconfigFile)) {
  let tsconfig = fs.readFileSync(tsconfigFile, "utf8");
  const beforeTsconfig = tsconfig;
  tsconfig = tsconfig.replace(/^\s*"baseUrl"\s*:\s*"\."\s*,\s*\r?\n/m, "");
  if (tsconfig !== beforeTsconfig) {
    fs.writeFileSync(tsconfigFile, tsconfig);
    console.log("[AGFusion] Removed obsolete TypeScript baseUrl option");
  }
}

// Next.js global CSS side-effect imports are valid application imports. Declare
// them explicitly for strict TypeScript so typecheck does not treat styles as
// missing modules.
const cssTypesFile = path.resolve("src/style-modules.d.ts");
if (!fs.existsSync(cssTypesFile)) {
  fs.writeFileSync(cssTypesFile, 'declare module "*.css";\n');
  console.log("[AGFusion] Added strict TypeScript CSS module declarations");
}

// The legacy browser-only paths are still typechecked by tsc even though the
// current production bridge is routed through the direct CCTP implementation.
// Keep their existing runtime behavior but make the legacy helper signatures
// reflect their nullable credentials and EIP-1193 provider contracts.
const kitKeyFile = path.resolve("src/lib/kit-key.ts");
if (fs.existsSync(kitKeyFile)) {
  let source = fs.readFileSync(kitKeyFile, "utf8");
  source = source.replace(
    /export function getPublicKitKey\(\): undefined \{/,
    "export function getPublicKitKey(): string | undefined {",
  );
  source = source.replace(
    /export async function ensureKitKey\(\): Promise<undefined> \{ return undefined; \}/,
    "export async function ensureKitKey(): Promise<string | undefined> { return undefined; }",
  );
  fs.writeFileSync(kitKeyFile, source);
}

const bridgeDebugFile = path.resolve("src/lib/bridge-debug.ts");
if (fs.existsSync(bridgeDebugFile)) {
  let source = fs.readFileSync(bridgeDebugFile, "utf8");
  source = source.replace(
    "extra: { method?: string; chainId?: string | number; durationMs?: number; error?: unknown } = {}",
    "extra: { method?: string; chainId?: string | number; durationMs?: number; error?: unknown; txHash?: string } = {}",
  );
  source = source.replace(
    "durationMs?: number; data?: unknown; error?: unknown;",
    "durationMs?: number; data?: unknown; error?: unknown; txHash?: string;",
  );
  fs.writeFileSync(bridgeDebugFile, source);
}

const activeWalletFile = path.resolve("src/sdk/active-wallet.ts");
if (fs.existsSync(activeWalletFile)) {
  let source = fs.readFileSync(activeWalletFile, "utf8");
  source = source.replace(
    "smartAccountAddress?: string;\n};",
    "smartAccountAddress?: string;\n  walletType?: string;\n  chainId?: number;\n};",
  );
  fs.writeFileSync(activeWalletFile, source);
}

const cctpBridgeFile = path.resolve("src/blockchain/circle-cctp-bridge.ts");
if (fs.existsSync(cctpBridgeFile)) {
  let source = fs.readFileSync(cctpBridgeFile, "utf8");
  source = source.replace(/destinationConfig\.explorer(?!Url)/g, "destinationConfig.explorerUrl");
  fs.writeFileSync(cctpBridgeFile, source);
}

const productionSwapFile = path.resolve("src/blockchain/production-swap.ts");
if (fs.existsSync(productionSwapFile)) {
  let source = fs.readFileSync(productionSwapFile, "utf8");
  source = source.replace(
    'const value = tokenIn === "USDC" ? `0x${amountIn.toString(16)}` : "0x0";',
    'const value: `0x${string}` = tokenIn === "USDC" ? (`0x${amountIn.toString(16)}` as `0x${string}`) : "0x0";',
  );
  fs.writeFileSync(productionSwapFile, source);
}

const financialReceiptFile = path.resolve("src/lib/financial-receipt.ts");
if (fs.existsSync(financialReceiptFile)) {
  let source = fs.readFileSync(financialReceiptFile, "utf8");
  source = source.replace(
    'Promise<{ status: ReceiptStatus; receipt: unknown }>',
    'Promise<{ status: ReceiptStatus; receipt: unknown; error?: string }>',
  );
  fs.writeFileSync(financialReceiptFile, source);
}

// The installed wallet provider accepts array-or-record params. Align the
// diagnostics wrapper to that same EIP-1193 shape instead of requiring an
// incompatible `unknown` parameter type.
if (fs.existsSync(bridgeDebugFile)) {
  let source = fs.readFileSync(bridgeDebugFile, "utf8");
  source = source.replace(
    'provider: { request: (args: { method: string; params?: unknown }) => Promise<unknown> },',
    'provider: { request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown> },',
  );
  fs.writeFileSync(bridgeDebugFile, source);
}

console.log("[AGFusion] Production build compatibility audit applied");
