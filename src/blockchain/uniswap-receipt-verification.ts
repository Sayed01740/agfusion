import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  http,
  type Address,
  type Hash,
} from "viem";

const ARC_MAINNET_CHAIN_ID = 5042;
const ARC_MAINNET_RPC = "https://rpc.mainnet.arc.io";
const UNIVERSAL_ROUTER = "0x8702463e73f74d0b6765aBceb314Ef07aCb92650".toLowerCase();
const ALLOWED_TOKENS = new Set([
  "0x3600000000000000000000000000000000000000",
  "0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1",
  "0x171a4217b86a807a64eb94757db6849fb4bdbAA0".toLowerCase(),
]);

const TRANSFER_ABI = [{
  type: "event",
  name: "Transfer",
  anonymous: false,
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "value", type: "uint256" },
  ],
}] as const;

const arcMainnet = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: "Arc Mainnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_MAINNET_RPC] } },
});
const publicClient = createPublicClient({ chain: arcMainnet, transport: http(ARC_MAINNET_RPC) });

function fail(message: string): never {
  throw new Error("Arc Mainnet receipt verification failed: " + message);
}

export async function verifyArcMainnetSwapReceipt(params: {
  hash: Hash;
  account: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  minimumAmountOut: bigint;
}) {
  const account = params.account.toLowerCase();
  const tokenIn = params.tokenIn.toLowerCase();
  const tokenOut = params.tokenOut.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(account)) fail("invalid wallet address");
  if (!ALLOWED_TOKENS.has(tokenIn) || !ALLOWED_TOKENS.has(tokenOut) || tokenIn === tokenOut) fail("token pair is not allowlisted");
  if (params.amountIn <= 0n || params.minimumAmountOut <= 0n) fail("invalid expected transfer amounts");

  const transaction = await publicClient.getTransaction({ hash: params.hash });
  if (transaction.chainId !== ARC_MAINNET_CHAIN_ID) fail("transaction is not on Arc Mainnet");
  if (transaction.from.toLowerCase() !== account) fail("transaction sender does not match quote wallet");
  if (!transaction.to || transaction.to.toLowerCase() !== UNIVERSAL_ROUTER) fail("transaction destination is not the Arc Universal Router");

  const receipt = await publicClient.getTransactionReceipt({ hash: params.hash });
  if (receipt.status !== "success") fail("transaction reverted");
  if (receipt.transactionHash.toLowerCase() !== params.hash.toLowerCase()) fail("receipt hash mismatch");

  let inputSpent = 0n;
  let outputReceived = 0n;
  for (const log of receipt.logs) {
    const logAddress = log.address.toLowerCase();
    if (logAddress !== tokenIn && logAddress !== tokenOut) continue;
    try {
      const decoded = decodeEventLog({ abi: TRANSFER_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName !== "Transfer") continue;
      const args = decoded.args as { from: Address; to: Address; value: bigint };
      if (logAddress === tokenIn && args.from.toLowerCase() === account) {
        inputSpent += args.value;
      }
      if (logAddress === tokenOut && args.to.toLowerCase() === account) {
        outputReceived += args.value;
      }
    } catch {
      // Ignore unrelated logs emitted by the allowlisted token contract.
    }
  }

  if (inputSpent !== params.amountIn) fail("actual input token transfer does not match exact quote amount");
  if (outputReceived < params.minimumAmountOut) fail("actual output token transfer is below the quoted minimum");

  return {
    verified: true as const,
    chainId: ARC_MAINNET_CHAIN_ID,
    transactionHash: params.hash,
    blockNumber: receipt.blockNumber,
    from: transaction.from,
    to: transaction.to,
    status: receipt.status,
    inputSpent,
    outputReceived,
  };
}
