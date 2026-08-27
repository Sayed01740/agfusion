declare module "@/lib/cctp-chains" {
  interface CctpChainConfig {
    explorer?: string;
  }
}

declare module "@/lib/bridge-debug" {
  export function attachBridgeProviderDiagnostics(
    provider: {
      request: (args: {
        method: string;
        params?: unknown[] | Record<string, unknown>;
      }) => Promise<unknown>;
    },
    label: string,
    txId?: string,
  ): void;
}
