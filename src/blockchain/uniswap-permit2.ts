import { isAddress, recoverTypedDataAddress } from "viem";

export const ARC_PERMIT2_CHAIN_ID = 5042;
export const ARC_PERMIT2_CONTRACT = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const ARC_PERMIT2_SPENDER = "0x8702463e73f74d0b6765aBceb314Ef07aCb92650";
const MAX_PERMIT_LIFETIME_SECONDS = 30 * 60;

const PERMIT_TYPES = {
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

type RecordValue = Record<string, unknown>;

export type ArcPermit2Expectation = {
  account: string;
  token: string;
  amount: bigint;
  nowSeconds?: number;
};

export type ValidatedArcPermit2 = {
  chainId: 5042;
  owner: string;
  token: string;
  amount: bigint;
  expiration: number;
  nonce: number;
  spender: string;
  sigDeadline: bigint;
  signature: `0x${string}`;
  recoveredSigner: string;
};

function fail(message: string): never {
  throw new Error("Arc Permit2 authorization rejected: " + message);
}

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeAddress(value: unknown, label: string): string {
  if (typeof value !== "string" || !isAddress(value)) fail("invalid " + label);
  return value.toLowerCase();
}

function parseUint(value: unknown, bits: number, label: string): bigint {
  let raw: string;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    raw = String(value);
  } else {
    return fail("invalid " + label);
  }
  if (!/^\d+$/.test(raw)) fail("invalid " + label);
  const parsed = BigInt(raw);
  if (parsed < 0n || parsed >= (1n << BigInt(bits))) fail(label + " exceeds uint" + bits);
  return parsed;
}

function assertFieldList(value: unknown, expected: readonly { name: string; type: string }[], label: string): void {
  if (!Array.isArray(value) || value.length !== expected.length) fail("unexpected " + label + " typed-data schema");
  for (let i = 0; i < expected.length; i += 1) {
    const field = value[i];
    if (!isRecord(field) || field.name !== expected[i].name || field.type !== expected[i].type) {
      fail("unexpected " + label + " typed-data schema");
    }
  }
}

/**
 * Verifies a fresh Uniswap Permit2 AllowanceTransfer PermitSingle signature.
 * This function is validation-only: it never prompts a wallet, approves tokens,
 * signs, builds a swap, or broadcasts a transaction.
 */
export async function validateArcPermit2Signature(
  permitData: unknown,
  signature: string,
  expected: ArcPermit2Expectation,
): Promise<ValidatedArcPermit2> {
  const now = expected.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now <= 0) fail("invalid local clock");
  if (expected.amount <= 0n || expected.amount >= (1n << 160n)) fail("expected exact amount is outside uint160");

  const owner = normalizeAddress(expected.account, "wallet account");
  const expectedToken = normalizeAddress(expected.token, "input token");
  if (!isRecord(permitData) || !isRecord(permitData.domain) || !isRecord(permitData.values) || !isRecord(permitData.types)) {
    fail("Permit2 typed data is missing or malformed");
  }

  const domain = permitData.domain;
  if (
    domain.name !== "Permit2" ||
    domain.version !== "1" ||
    Number(domain.chainId) !== ARC_PERMIT2_CHAIN_ID ||
    normalizeAddress(domain.verifyingContract, "Permit2 verifying contract") !== ARC_PERMIT2_CONTRACT.toLowerCase()
  ) {
    fail("EIP-712 domain does not match Arc Mainnet Permit2");
  }

  assertFieldList(permitData.types.PermitDetails, PERMIT_TYPES.PermitDetails, "PermitDetails");
  assertFieldList(permitData.types.PermitSingle, PERMIT_TYPES.PermitSingle, "PermitSingle");

  const values = permitData.values;
  if (!isRecord(values.details)) fail("Permit2 details are missing");
  const details = values.details;
  const token = normalizeAddress(details.token, "Permit2 token");
  if (token !== expectedToken) fail("Permit2 token does not match the quoted input token");

  const amount = parseUint(details.amount, 160, "Permit2 amount");
  if (amount !== expected.amount) fail("Permit2 amount does not match the exact quoted input amount");

  const expirationBigInt = parseUint(details.expiration, 48, "Permit2 expiration");
  const nonceBigInt = parseUint(details.nonce, 48, "Permit2 nonce");
  const sigDeadline = parseUint(values.sigDeadline, 256, "Permit2 signature deadline");
  if (expirationBigInt <= BigInt(now) || expirationBigInt > BigInt(now + MAX_PERMIT_LIFETIME_SECONDS)) {
    fail("Permit2 allowance expiration is expired or exceeds 30 minutes");
  }
  if (sigDeadline <= BigInt(now) || sigDeadline > expirationBigInt || sigDeadline > BigInt(now + MAX_PERMIT_LIFETIME_SECONDS)) {
    fail("Permit2 signature deadline is expired or outside the allowed window");
  }

  const spender = normalizeAddress(values.spender, "Permit2 spender");
  if (spender !== ARC_PERMIT2_SPENDER.toLowerCase()) fail("Permit2 spender is not the allowlisted Arc Universal Router");

  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    fail("signature must be a 65-byte ECDSA signature");
  }

  let recoveredSigner: string;
  try {
    recoveredSigner = (await recoverTypedDataAddress({
      domain: {
        name: "Permit2",
        version: "1",
        chainId: ARC_PERMIT2_CHAIN_ID,
        verifyingContract: ARC_PERMIT2_CONTRACT,
      },
      types: PERMIT_TYPES,
      primaryType: "PermitSingle",
      message: {
        details: {
          token: token as `0x${string}`,
          amount,
          expiration: Number(expirationBigInt),
          nonce: Number(nonceBigInt),
        },
        spender: spender as `0x${string}`,
        sigDeadline,
      },
      signature: signature as `0x${string}`,
    })).toLowerCase();
  } catch {
    return fail("EIP-712 signature recovery failed");
  }

  if (recoveredSigner !== owner) fail("Permit2 signature does not recover the quoted wallet account");

  return {
    chainId: ARC_PERMIT2_CHAIN_ID,
    owner,
    token,
    amount,
    expiration: Number(expirationBigInt),
    nonce: Number(nonceBigInt),
    spender,
    sigDeadline,
    signature: signature as `0x${string}`,
    recoveredSigner,
  };
}
