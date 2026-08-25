# AGFusion Production Stable Baseline

## Known-good production state

- Verified: 2026-08-26
- Known-good commit: `40a416837e9ca9039e30c59940407234441e72b3`
- Stable branch: `production-stable-2026-08-26`

## Critical Circle transaction rule

Circle contract-execution `amount` must be sent as a human-readable native-token amount, not an EVM base-unit value.

Example for Arc native USDC:

- Human amount: `1 USDC`
- EVM value: `1000000000000000000`
- Circle contract-execution `amount`: `"1"`

Do not change this conversion without regression testing against the production swap flow.

## Protected swap areas

Changes to the following should be treated as production-critical and regression-tested before release:

- Circle contract execution
- Native amount/base-unit conversion
- Token decimals
- Arc chain ID and contract addresses
- Wallet ID and transaction creation
- Swap calldata and router parameters
- Circle challenge/transaction status handling
- Transaction receipt and explorer-hash handling

## Release rule

Develop new swap-related changes on a feature branch first. Verify the Preview deployment, run the swap regression test, then merge to the production branch.

If a production change breaks the swap flow, restore the known-good commit listed above before continuing investigation.
