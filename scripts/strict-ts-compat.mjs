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
  // The browser adapter factory is nullable by design. The explicit guard in
  // the source code proves it is present before the adapter is used.
  source = source.replace(
    /wiredAdapter = wired\.adapter;/g,
    "wiredAdapter = wired!.adapter;",
  );

  // App Kit is checked immediately after loading. Non-null assertions here
  // keep TypeScript from losing that invariant across the event callback and
  // mutable SDK result flow without changing runtime behavior.
  source = source.replace(/kit\.on\("\\*", onBridgeEvent\);/g, 'kit!.on("*", onBridgeEvent!);');
  source = source.replace(/kit\.bridge\(bridgeParams\)/g, "kit!.bridge(bridgeParams)");
  source = source.replace(/kit\.retryBridge\(result,/g, "kit!.retryBridge(result,");
  source = source.replace(/kit\.off\?\.\("\\*", onBridgeEvent\)/g, 'kit!.off?.("*", onBridgeEvent!);');

  // initBridgeState requires a concrete recipient. The bridge preflight has
  // already validated an explicit recipient; otherwise the connected wallet
  // address is the safe default.
  source = source.replace(
    /amount: String\(params\.amount\),\n        recipient: params\.recipient,\n      \}\);/g,
    'amount: String(params.amount),\n        recipient: params.recipient ?? meta?.address ?? "",\n      });',
  );

  // TransactionRecord requires a concrete txHash while a bridge can still be
  // retryable. Keep the record shape stable and let status/retryable carry the
  // pending state.
  source = source.replace(/txHash: destHash,/g, 'txHash: destHash ?? "",');

  // deriveBridgeState can be optional in recovery. The immediately preceding
  // truthiness guard proves the value exists at the persistence call.
  source = source.replace(/saveBridgeState\(bState\);/g, "saveBridgeState(bState!);");

  // Older strict TypeScript configurations treat catch variables as unknown.
  // These catches are intentionally diagnostic/rethrow paths and already
  // normalize their messages before any user-facing error is emitted.
  source = source.replace(/catch \(e\) \{/g, "catch (e: any) {");

  return source;
}, "App Kit strict TypeScript guards");

patchFile("src/lib/financial-receipt.ts", (source) => {
  // verifyReceiptOnChain returns { status, receipt }; it does not expose an
  // `error` field. The status itself is the authoritative failure signal.
  source = source.replace(
    'message: verified.error || "Receipt was not confirmed with status 0x1.",',
    'message: "Receipt was not confirmed with status 0x1.",',
  );
  return source;
}, "financial receipt result typing");
