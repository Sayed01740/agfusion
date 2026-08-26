import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/sdk/wallet-adapter.ts");
let source = fs.readFileSync(file, "utf8");

const oldImport = 'import { ArcTestnet } from "@circle-fin/app-kit/chains";';
const newImport = `import { ArcTestnet } from "@circle-fin/app-kit/chains";\nimport {\n  baseSepolia,\n  arbitrumSepolia,\n  optimismSepolia,\n  polygonAmoy,\n  avalancheFuji,\n  unichainSepolia,\n  lineaSepolia,\n} from "viem/chains";`;

if (source.includes(oldImport) && !source.includes("baseSepolia")) {
  source = source.replace(oldImport, newImport);
}

const oldCapabilities = `capabilities: {\n        addressContext: "user-controlled",\n        supportedChains: [ArcTestnet],\n      },`;
const newCapabilities = `capabilities: {\n        addressContext: "user-controlled",\n        // This adapter is used by kit.bridge() for both the selected source\n        // chain and Arc destination. It must advertise every EVM chain that\n        // AGFusion can bridge, not only Arc. The previous Arc-only list caused\n        // "Invalid chain not supported by this adapter" for every non-Arc source.\n        supportedChains: [\n          ArcTestnet,\n          baseSepolia,\n          arbitrumSepolia,\n          optimismSepolia,\n          polygonAmoy,\n          avalancheFuji,\n          unichainSepolia,\n          lineaSepolia,\n        ],\n      },`;

if (source.includes(oldCapabilities)) {
  source = source.replace(oldCapabilities, newCapabilities);
}

fs.writeFileSync(file, source);
