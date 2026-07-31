/**
 * Circle Arc App Kit singleton.
 * Uses real dynamic import() so Next/Webpack can bundle @circle-fin/app-kit for the browser.
 * (new Function("import") was blocking the package — that caused "App Kit package not loaded".)
 */

export type AppKitLike = {
  bridge: (params: unknown) => Promise<unknown>;
  swap: (params: unknown) => Promise<unknown>;
  send: (params: unknown) => Promise<unknown>;
  estimateBridge: (params: unknown) => Promise<unknown>;
  estimateSwap: (params: unknown) => Promise<unknown>;
  estimateSend: (params: unknown) => Promise<unknown>;
  retryBridge: (result: unknown, ctx: unknown) => Promise<unknown>;
  on: (event: string, handler: (payload: unknown) => void) => void;
  off: (event: string, handler: (payload: unknown) => void) => void;
  unifiedBalance: {
    deposit: (params: unknown) => Promise<unknown>;
    spend: (params: unknown) => Promise<unknown>;
  };
  getSupportedChains: (op?: string) => unknown[];
};

let kitSingleton: AppKitLike | null = null;
let loadError: string | null = null;

export function getAppKitLoadError(): string | null {
  return loadError;
}

export async function isAppKitInstalled(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const mod = await import("@circle-fin/app-kit");
    return Boolean(mod?.AppKit);
  } catch {
    return false;
  }
}

export async function getAppKit(): Promise<AppKitLike | null> {
  if (typeof window === "undefined") {
    loadError = "App Kit only runs in the browser";
    return null;
  }
  if (kitSingleton) return kitSingleton;

  try {
    // Ensure Circle Stablecoin Service calls go through our proxy (avoids 8002 Failed to fetch)
    const { installCircleApiProxy } = await import("@/lib/circle-proxy");
    installCircleApiProxy();

    const mod = await import("@circle-fin/app-kit");
    const AppKitCtor = mod.AppKit as
      | (new (config?: unknown) => AppKitLike)
      | undefined;
    if (!AppKitCtor) {
      loadError = "AppKit export missing from @circle-fin/app-kit";
      return null;
    }
    kitSingleton = new AppKitCtor({ disableErrorReporting: true });
    loadError = null;
    return kitSingleton;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
    console.error("[AGFusion] Failed to load @circle-fin/app-kit:", e);
    return null;
  }
}

export function isLiveAppKit(): boolean {
  return kitSingleton !== null;
}

/** Reset singleton (e.g. after env/key change) */
export function resetAppKit(): void {
  kitSingleton = null;
  loadError = null;
}
