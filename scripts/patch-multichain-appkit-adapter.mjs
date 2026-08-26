import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/sdk/wallet-adapter.ts");
let source = fs.readFileSync(file, "utf8");

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

if (source.includes(oldImport)) {
  source = source.replace(oldImport, multichainImport);
} else {
  throw new Error("Multichain App Kit patch: ArcTestnet import not found.");
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
const matches = source.match(arcOnlyBlock)?.length ?? 0;
if (matches === 0) {
  // It may already be patched. In that case leave it alone, but validate it
  // below rather than silently accepting an Arc-only adapter.
  if (!source.includes("supportedChains: [\n          ArcTestnet,")) {
    throw new Error("Multichain App Kit patch: no Arc-only capability block found and no multichain block detected.");
  }
} else {
  source = source.replace(arcOnlyBlock, multichainCapabilities);
}

// Hard build guard. If this fails, Vercel must not publish an adapter that
// advertises only Arc Testnet.
const hasMultichain =
  source.includes("baseSepolia") &&
  source.includes("arbitrumSepolia") &&
  source.includes("optimismSepolia") &&
  source.includes("polygonAmoy") &&
  source.includes("avalancheFuji") &&
  source.includes("unichainSepolia") &&
  source.includes("lineaSepolia") &&
  source.includes("supportedChains: [\n          ArcTestnet,");

const remainingArcOnly = (source.match(/supportedChains:\s*\[\s*ArcTestnet\s*\]/g) || []).length;
if (!hasMultichain || remainingArcOnly > 0) {
  throw new Error(
    `Multichain App Kit patch incomplete: hasMultichain=${hasMultichain}, remainingArcOnly=${remainingArcOnly}`,
  );
}

fs.writeFileSync(file, source);
console.log("[AGFusion] App Kit adapter patched: Arc + Base + Arbitrum + Optimism + Polygon + Avalanche + Unichain + Linea");
