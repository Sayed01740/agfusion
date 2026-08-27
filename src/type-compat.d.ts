declare module "@/lib/cctp-config" {
  interface CctpChainConfig {
    explorer?: string;
  }
}

declare module "@/lib/bridge-debug-v5" {
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
