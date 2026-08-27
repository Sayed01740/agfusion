declare module "@/lib/bridge-debug" {
  import type { InjectedProvider } from "@/sdk/wallet-adapter";

  export function attachBridgeProviderDiagnostics(
    provider: InjectedProvider,
    label: string,
    txId?: string,
  ): void;

  export function recordBridgeDebug(
    stage: string,
    data?: unknown,
    txId?: string,
    message?: string,
    extra?: {
      method?: string;
      chainId?: string | number;
      durationMs?: number;
      error?: unknown;
      txHash?: string;
    },
  ): void;
}
