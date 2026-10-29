/** Resolve a contract address for one Arc environment without reusing Testnet on Mainnet. */
export function getNetworkContractAddress(
  isMainnet: boolean,
  mainnetAddress: string | undefined,
  testnetAddress: string | undefined,
  legacyTestnetAddress?: string | undefined,
): `0x${string}` | undefined {
  const configured = isMainnet
    ? mainnetAddress
    : testnetAddress || legacyTestnetAddress;
  const value = configured?.trim();
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return undefined;
  return value.toLowerCase() as `0x${string}`;
}
