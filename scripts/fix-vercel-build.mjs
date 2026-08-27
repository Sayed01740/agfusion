import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/blockchain/appkit-service.ts");
let source = fs.readFileSync(file, "utf8");

const broken = "wiredAdapter = wired.adapter;";
const fixed = "wiredAdapter = wired!.adapter;";

if (source.includes(broken)) {
  source = source.replaceAll(broken, fixed);
} else if (!source.includes(fixed)) {
  throw new Error("Vercel build fix: expected wired adapter assignment was not found.");
}

fs.writeFileSync(file, source);
console.log("[AGFusion] Strict TypeScript nullability fix applied to wired adapter assignment.");
