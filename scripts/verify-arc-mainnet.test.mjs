import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("./verify-arc-mainnet.mjs", import.meta.url));
const badRpc = "http://127.0.0.1:1";
const validAddress = "0x1111111111111111111111111111111111111111";

function runPreflight(overrides = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    timeout: 5_000,
    env: {
      ...process.env,
      ARC_MAINNET_RPC_URL: badRpc,
      NEXT_PUBLIC_AGFUSION_REGISTRY_MAINNET_ADDRESS: "",
      NEXT_PUBLIC_AGFUSION_ESCROW_MAINNET_ADDRESS: "",
      NEXT_PUBLIC_AGFUSION_DISPERSE_MAINNET_ADDRESS: "",
      AGFUSION_EXPECTED_REGISTRY_OWNER: "",
      AGFUSION_EXPECTED_ESCROW_ARBITRATOR: "",
      AGFUSION_EXPECTED_ESCROW_FEE_RECIPIENT: "",
      AGFUSION_EXPECTED_ESCROW_FEE_BPS: "",
      ...overrides,
    },
  });
}

test("fails closed on missing deployment addresses before contacting RPC", () => {
  const result = runPreflight();
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stderr, /Missing or invalid NEXT_PUBLIC_AGFUSION_REGISTRY_MAINNET_ADDRESS/);
  assert.doesNotMatch(result.stderr, /fetch failed|ECONNREFUSED|RPC HTTP/);
});

test("rejects an invalid expected fee before contacting RPC", () => {
  const result = runPreflight({
    NEXT_PUBLIC_AGFUSION_REGISTRY_MAINNET_ADDRESS: validAddress,
    NEXT_PUBLIC_AGFUSION_ESCROW_MAINNET_ADDRESS: validAddress,
    NEXT_PUBLIC_AGFUSION_DISPERSE_MAINNET_ADDRESS: validAddress,
    AGFUSION_EXPECTED_REGISTRY_OWNER: validAddress,
    AGFUSION_EXPECTED_ESCROW_ARBITRATOR: validAddress,
    AGFUSION_EXPECTED_ESCROW_FEE_RECIPIENT: validAddress,
    AGFUSION_EXPECTED_ESCROW_FEE_BPS: "501",
  });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stderr, /AGFUSION_EXPECTED_ESCROW_FEE_BPS must be from 0 to 500/);
  assert.doesNotMatch(result.stderr, /fetch failed|ECONNREFUSED|RPC HTTP/);
});
