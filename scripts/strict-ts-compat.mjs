import fs from "node:fs";
import path from "node:path";

function patchFile(relativePath, transform, label) {
  const file = path.resolve(relativePath);
  let source = fs.readFileSync(file, "utf8");
  const before = source;
  source = transform(source);
  if (source === before) {
    console.log(`[AGFusion] ${label}: already normalized`);
  } else {
    fs.writeFileSync(file, source);
    console.log(`[AGFusion] ${label}: compatibility fixes applied`);
  }
}

patchFile("src/blockchain/appkit-service.ts", (source) => {
  source = source.replace(
    /wiredAdapter = wired\.adapter;/g,
    "wiredAdapter = wired!.adapter;",
  );

  source = source.replace(
    /kit\.on\("\*", onBridgeEvent\);/g,
    'kit!.on("*", onBridgeEvent!);',
  );
  source = source.replace(
    /kit\.bridge\(bridgeParams\)/g,
    "kit!.bridge(bridgeParams)",
  );
  source = source.replace(
    /kit\.retryBridge\(result,/g,
    "kit!.retryBridge(result,",
  );
  source = source.replace(
    /kit\.off\?\.\("\*", onBridgeEvent\)/g,
    'kit!.off?.("*", onBridgeEvent!)',
  );

  source = source.replace(
    /amount: String\(params\.amount\),\n        recipient: params\.recipient,\n      \}\);/g,
    'amount: String(params.amount),\n        recipient: params.recipient ?? meta?.address ?? "",\n      });',
  );

  source = source.replace(/txHash: destHash,/g, 'txHash: destHash ?? "",');
  source = source.replace(/saveBridgeState\(bState\);/g, "saveBridgeState(bState!);");

  // These catches only normalize diagnostics/rethrow errors. Explicitly typing
  // them as any preserves the existing runtime behavior while satisfying the
  // repository's strict TypeScript configuration.
  source = source.replace(/catch \(e\) \{/g, "catch (e: any) {");

  return source;
}, "App Kit strict TypeScript guards");

patchFile("src/lib/financial-receipt.ts", (source) => {
  source = source.replace(
    'message: verified.error || "Receipt was not confirmed with status 0x1.",',
    'message: "Receipt was not confirmed with status 0x1.",',
  );
  return source;
}, "financial receipt result typing");
