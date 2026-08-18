/**
 * Circle Arc App Kit singleton.
 *
 * The Circle Kit key is SERVER-ONLY. The browser App Kit client must use the
 * keyless/permissive path. Circle requests are routed through our same-origin
 * server proxy, which injects the real KIT_KEY on the server.
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

/**
 * Deprecated browser accessor kept only for compatibility with older callers.
 * NEVER expose the real Circle KIT_KEY to browser JavaScript.
 */
export async function getBrowserKitKey(): Promise<string | null> {
  return null;
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

    // IMPORTANT: do not pass kitKey/config.kitKey in the browser. The current
    // Circle SDK explicitly rejects a kitKey in a browser environment.
    // Circle API calls are authenticated by /api/circle/proxy on the server.
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

/** Reset singleton */
export function resetAppKit(): void {
  kitSingleton = null;
  loadError = null;
}
