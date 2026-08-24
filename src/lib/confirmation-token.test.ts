import { describe, expect, it } from "vitest";
import {
  consumeConfirmationToken,
  issueConfirmationToken,
  verifyConfirmationToken,
} from "./confirmation-token";

describe("confirmation capability", () => {
  const action = {
    preview: {
      type: "bridge",
      amount: "5",
      token: "USDC",
      fromChain: "Arc_Testnet",
      toChain: "Base_Sepolia",
      canExecute: true,
    },
  };

  it("binds a token to the wallet and exact reviewed action", () => {
    const token = issueConfirmationToken({
      wallet: "0xABCDEF0000000000000000000000000000000001",
      action,
    });

    expect(
      verifyConfirmationToken({
        token,
        wallet: "0xabcdef0000000000000000000000000000000001",
        action,
      }),
    ).toBe(true);

    expect(
      verifyConfirmationToken({
        token,
        wallet: "0xabcdef0000000000000000000000000000000002",
        action,
      }),
    ).toBe(false);

    expect(
      verifyConfirmationToken({
        token,
        wallet: "0xabcdef0000000000000000000000000000000001",
        action: {
          ...action,
          preview: { ...action.preview, amount: "50" },
        },
      }),
    ).toBe(false);
  });

  it("consumes a capability once and rejects replay", () => {
    const token = issueConfirmationToken({
      wallet: "0xabcdef0000000000000000000000000000000001",
      action,
    });

    expect(
      consumeConfirmationToken({
        token,
        wallet: "0xabcdef0000000000000000000000000000000001",
        action,
      }),
    ).toBe(true);

    expect(
      consumeConfirmationToken({
        token,
        wallet: "0xabcdef0000000000000000000000000000000001",
        action,
      }),
    ).toBe(false);
  });
});
