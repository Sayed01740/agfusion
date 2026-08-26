import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/sdk/wallet-adapter.ts");
let source = fs.readFileSync(file, "utf8");

const oldImport = 'import { ArcTestnet } from "@circle-fin/app-kit/chains";';
const newImport = `import { ArcTestnet } from "@circle-fin/app-kit/chains";
import {
  baseSepolia,
  arbitrumSepolia,
  optimismSepolia,
  polygonAmoy,
  avalancheFuji,
  unichainSepolia,
  lineaSepolia,
} from "viem/chains";`;

if (source.includes(oldImport) && !source.includes('from "viem/chains"')) {
  source = source.replace(oldImport, newImport);
}

const oldCapabilities = `capabilities: {
        addressContext: "user-controlled",
        supportedChains: [ArcTestnet],
      },`;
const newCapabilities = `capabilities: {
        addressContext: "user-controlled",
        // kit.bridge() validates the source chain against this adapter.
        // Keep every bridgeable EVM testnet here, not only Arc.
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

// wallet-adapter.ts creates more than one adapter instance. Replace every
// Arc-only capability block, not just the first occurrence.
if (source.includes(oldCapabilities)) {
  source = source.split(oldCapabilities).join(newCapabilities);
}

// Never silently ship an Arc-only adapter again.
const remainingArcOnly = (source.match(/supportedChains:\s*\[ArcTestnet\]/g) || []).length;
if (remainingArcOnly > 0) {
  throw new Error(`Multichain App Kit patch incomplete: ${remainingArcOnly} Arc-only adapter block(s) remain.`);
}

fs.writeFileSync(file, source);
