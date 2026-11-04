#!/usr/bin/env node

// Import/instantiate only: no keys, RPC calls, signing, or transaction submission.
// This catches runtime API incompatibilities hidden by unit tests that mock Circle's SDK.
try {
  const [{ AppKit }, { createViemAdapterFromProvider }] = await Promise.all([
    import("@circle-fin/app-kit"),
    import("@circle-fin/adapter-viem-v2"),
  ]);
  const kit = new AppKit();
  if (typeof kit.estimateSwap !== "function") {
    throw new Error("AppKit.estimateSwap is not available");
  }
  if (typeof createViemAdapterFromProvider !== "function") {
    throw new Error("createViemAdapterFromProvider is not available");
  }
  console.log("PASS: Circle App Kit and Viem adapter import and initialize without network access.");
} catch (error) {
  console.error("FAIL: Circle App Kit runtime compatibility check failed.");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
}
