import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  ARC_PERMIT2_CONTRACT,
  ARC_PERMIT2_SPENDER,
  validateArcPermit2Signature,
} from "@/blockchain/uniswap-permit2";

const ACCOUNT = privateKeyToAccount("0x0000000000000000000000000000000000000000000000000000000000000001");
const OTHER_ACCOUNT = privateKeyToAccount("0x0000000000000000000000000000000000000000000000000000000000000002");
const USDC = "0x3600000000000000000000000000000000000000";
const NOW = 1_800_000_000;
const AMOUNT = 1_000_000n;

const types = {
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
  PermitSingle: [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
} as const;

function makePermitData(overrides: {
  chainId?: number;
  verifyingContract?: string;
  token?: string;
  amount?: string;
  expiration?: string;
  nonce?: string;
  spender?: string;
  sigDeadline?: string;
  typedDetails?: unknown;
} = {}) {
  return {
    domain: {
      name: "Permit2",
      version: "1",
      chainId: overrides.chainId ?? 5042,
      verifyingContract: overrides.verifyingContract ?? ARC_PERMIT2_CONTRACT,
    },
    types: {
      PermitDetails: overrides.typedDetails ?? types.PermitDetails,
      PermitSingle: types.PermitSingle,
    },
    values: {
      details: {
        token: overrides.token ?? USDC,
        amount: overrides.amount ?? AMOUNT.toString(),
        expiration: overrides.expiration ?? String(NOW + 900),
        nonce: overrides.nonce ?? "7",
      },
      spender: overrides.spender ?? ARC_PERMIT2_SPENDER,
      sigDeadline: overrides.sigDeadline ?? String(NOW + 600),
    },
  };
}

async function signPermit(
  account: typeof ACCOUNT = ACCOUNT,
  data = makePermitData(),
): Promise<`0x${string}`> {
  const values = data.values;
  return account.signTypedData({
    domain: {
      name: "Permit2",
      version: "1",
      chainId: Number(data.domain.chainId),
      verifyingContract: data.domain.verifyingContract as `0x${string}`,
    },
    types,
    primaryType: "PermitSingle",
    message: {
      details: {
        token: values.details.token as `0x${string}`,
        amount: BigInt(values.details.amount),
        expiration: Number(values.details.expiration),
        nonce: Number(values.details.nonce),
      },
      spender: values.spender as `0x${string}`,
      sigDeadline: BigInt(values.sigDeadline),
    },
  });
}

const expectation = {
  account: ACCOUNT.address,
  token: USDC,
  amount: AMOUNT,
  nowSeconds: NOW,
};

describe("Arc Mainnet Permit2 signature validation", () => {
  it("accepts a fresh exact-amount Permit2 signature bound to the wallet and router", async () => {
    const data = makePermitData();
    const signature = await signPermit(ACCOUNT, data);
    const result = await validateArcPermit2Signature(data, signature, expectation);
    expect(result.chainId).toBe(5042);
    expect(result.owner).toBe(ACCOUNT.address.toLowerCase());
    expect(result.token).toBe(USDC.toLowerCase());
    expect(result.amount).toBe(AMOUNT);
    expect(result.spender).toBe(ARC_PERMIT2_SPENDER.toLowerCase());
    expect(result.recoveredSigner).toBe(ACCOUNT.address.toLowerCase());
  });

  it("rejects a signature from a different wallet", async () => {
    const data = makePermitData();
    const signature = await signPermit(OTHER_ACCOUNT, data);
    await expect(validateArcPermit2Signature(data, signature, expectation)).rejects.toThrow(/does not recover/);
  });

  it.each([
    ["wrong chain", { chainId: 1 }],
    ["wrong Permit2 contract", { verifyingContract: ACCOUNT.address }],
    ["wrong input token", { token: "0x2222222222222222222222222222222222222222" }],
    ["wrong exact amount", { amount: "1000001" }],
    ["wrong spender", { spender: ACCOUNT.address }],
    ["expired signature deadline", { sigDeadline: String(NOW - 1) }],
    ["signature deadline after expiration", { sigDeadline: String(NOW + 901) }],
    ["excessive allowance expiration", { expiration: String(NOW + 1801) }],
  ] as const)("rejects %s", async (_label, overrides) => {
    const data = makePermitData(overrides);
    const signature = await signPermit(ACCOUNT, data);
    await expect(validateArcPermit2Signature(data, signature, expectation)).rejects.toThrow();
  });

  it("rejects a modified typed-data schema", async () => {
    const data = makePermitData({ typedDetails: [{ name: "token", type: "address" }] });
    const signature = await signPermit(ACCOUNT, data);
    await expect(validateArcPermit2Signature(data, signature, expectation)).rejects.toThrow(/typed-data schema/);
  });

  it("rejects malformed signatures", async () => {
    await expect(validateArcPermit2Signature(makePermitData(), "0x1234", expectation)).rejects.toThrow(/65-byte/);
  });

  it("rejects an expired allowance", async () => {
    const data = makePermitData({ expiration: String(NOW) });
    const signature = await signPermit(ACCOUNT, data);
    await expect(validateArcPermit2Signature(data, signature, expectation)).rejects.toThrow(/expiration is expired/);
  });
});
