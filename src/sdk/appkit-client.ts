/**
 * Circle Arc App Kit singleton.
 * Uses a real dynamic import so Next/Webpack can bundle @circle-fin/app-kit.
 * Kit keys are optional per the current Arc swap quickstart. If /api/kit is
 * unavailable or no KIT_KEY is configured, App Kit still initializes and the
 * SDK uses its normal rate-limited path.
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
let browserKitKey: string | null = null;
let kitKeyLoaded = false;

export function getAppKitLoadError(): string | null {
  return loadError;
}

/**
 * KIT_KEY is optional in the current Arc App Kit swap flow. Never make the
 * entire swap UI depend on /api/kit being configured.
 */
async function loadBrowserKitKey(): Promise<string | null> {
  if (kitKeyLoaded) return browserKitKey;
  kitKeyLoaded = true;

  if (typeof window === "undefined") return null;

  try {
    const response = await fetch("/api/kit", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = (await response.json().catch(() => null)) as
      | { kitKey?: string | null; configured?: boolean; valid?: boolean | null }
      | null;

    const key = typeof data?.kitKey === "string" ? data.kitKey.trim() : "";
    if (!response.ok || !key) return null;
    if (!/^KIT_KEY:[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+$/.test(key)) return null;

    browserKitKey = key;
    return key;
  } catch {
    return null;
  }
}

export async function getBrowserKitKey(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return loadBrowserKitKey();
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

    const kitKey = await loadBrowserKitKey();
    const mod = await import("@circle-fin/app-kit");
    const AppKitCtor = mod.AppKit as
      | (new (config?: unknown) => AppKitLike)
      | undefined;
    if (!AppKitCtor) {
      loadError = "AppKit export missing from @circle-fin/app-kit";
      return null;
    }

    // Do not send an undefined/empty kitKey. The current SDK accepts an empty
    // configuration and falls back to its rate-limited mode.
    kitSingleton = new AppKitCtor(
      kitKey
        ? { kitKey, disableErrorReporting: true }
        : { disableErrorReporting: true },
    );
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
  browserKitKey = null;
  kitKeyLoaded = false;
  loadError = null;
}
