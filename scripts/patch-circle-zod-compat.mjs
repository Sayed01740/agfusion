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
      /(\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)(["'])zod\2/g,
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
  // A previous run can already have rewritten all imports.
  const appKit = path.resolve("node_modules/@circle-fin/app-kit/index.mjs");
  if (!fs.existsSync(appKit) || !fs.readFileSync(appKit, "utf8").includes("zod/v3")) {
    throw new Error("No Circle Zod imports were rewritten; package layout may have changed.");
  }
}

// Zod 4's zod/v3 export retains the Zod 3 API, but its published v3 parser may
// lack the early-return hardening from GHSA-mrhx-c7xc-m3w5. Backport the same
// bounded array/set guard in the installed v3 runtime. This is an installation
// build patch only; the regression test verifies it actually stops element parsing.
const zodV3TypesPath = path.resolve("node_modules/zod/v3/types.js");
if (!fs.existsSync(zodV3TypesPath)) {
  throw new Error("Zod v3 compatibility runtime was not found at node_modules/zod/v3/types.js.");
}
let zodV3Types = fs.readFileSync(zodV3TypesPath, "utf8");
let guardsAdded = 0;

const arrayMarker = "AGFUSION_ZOD3_ARRAY_SIZE_GUARD";
if (!zodV3Types.includes(arrayMarker)) {
  const arrayStart = zodV3Types.indexOf("class ZodArray");
  const arrayParse = arrayStart >= 0 ? zodV3Types.indexOf("if (ctx.common.async)", arrayStart) : -1;
  if (arrayStart < 0 || arrayParse < 0) {
    throw new Error("Could not locate the Zod v3 array parser; refusing an unsafe partial patch.");
  }
  const arrayGuard =
    "\n    // " + arrayMarker + ": reject oversize bounded arrays before parsing each element.\n" +
    "    if (\n" +
    "      (def.exactLength !== null && ctx.data.length > def.exactLength.value) ||\n" +
    "      (def.maxLength !== null && ctx.data.length > def.maxLength.value)\n" +
    "    ) {\n" +
    "      return INVALID;\n" +
    "    }\n\n";
  zodV3Types = zodV3Types.slice(0, arrayParse) + arrayGuard + zodV3Types.slice(arrayParse);
  guardsAdded += 1;
}

const setMarker = "AGFUSION_ZOD3_SET_SIZE_GUARD";
if (!zodV3Types.includes(setMarker)) {
  const setStart = zodV3Types.indexOf("class ZodSet");
  const valueType = setStart >= 0
    ? zodV3Types.indexOf("const valueType = this._def.valueType;", setStart)
    : -1;
  if (setStart < 0 || valueType < 0) {
    throw new Error("Could not locate the Zod v3 set parser; refusing an unsafe partial patch.");
  }
  const setGuard =
    "\n    // " + setMarker + ": stop after the existing max-size issue has been recorded.\n" +
    "    if (def.maxSize !== null && ctx.data.size > def.maxSize.value) {\n" +
    "      return INVALID;\n" +
    "    }\n\n";
  zodV3Types = zodV3Types.slice(0, valueType) + setGuard + zodV3Types.slice(valueType);
  guardsAdded += 1;
}

if (guardsAdded > 0) fs.writeFileSync(zodV3TypesPath, zodV3Types);
console.log(
  "[AGFusion] Circle Zod compatibility patch: rewrote " +
  importsRewritten +
  " import(s) across " +
  filesVisited +
  " source files; " +
  guardsAdded +
  " Zod v3 security guard(s) added.",
);
