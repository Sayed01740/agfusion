#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

// Circle's published bundles in this dependency set use the Zod 3 function-schema
// API. Zod 4 provides that API through the stable "zod/v3" compatibility export.
// Keep the patched Zod 4 package at the resolver root and redirect Circle imports
// to the compatibility export, rather than loading vulnerable nested Zod 3 copies.
const circleRoot = path.resolve("node_modules/@circle-fin");
if (!fs.existsSync(circleRoot)) {
  throw new Error("Circle SDK packages are not installed; run npm install first.");
}

const sourceExtensions = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".mts", ".cts",
  ".d.ts", ".d.mts", ".d.cts",
]);

function isSourceFile(file) {
  return [...sourceExtensions].some((ext) => file.endsWith(ext));
}

let filesVisited = 0;
let importsRewritten = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!entry.isFile() || !isSourceFile(entry.name)) continue;

    filesVisited += 1;
    const before = fs.readFileSync(fullPath, "utf8");
    // Rewrite only actual import/require specifiers that equal the bare module name.
    const after = before.replace(
      /(\\bfrom\\s*|\\bimport\\s*\\(\\s*|\\brequire\\s*\\(\\s*)(["'])zod\\2/g,
      (_match, prefix, quote) => {
        importsRewritten += 1;
        return prefix + quote + "zod/v3" + quote;
      },
    );
    if (after !== before) fs.writeFileSync(fullPath, after);
  }
}

walk(circleRoot);
if (importsRewritten === 0) {
  throw new Error("No Circle Zod imports were rewritten; package layout may have changed.");
}
console.log(
  `[AGFusion] Circle Zod compatibility patch: rewrote ${importsRewritten} import(s) across ${filesVisited} source files to zod/v3.`,
);
