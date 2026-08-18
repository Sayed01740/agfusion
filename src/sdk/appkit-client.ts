/**
 * Circle Arc App Kit singleton.
 * Uses real dynamic import() so Next/Webpack can bundle @circle-fin/app-kit for the browser.
 * The Kit key is bootstrapped from the server-owned Vercel secret via /api/kit,
 * then passed explicitly to App Kit and swap calls as required by Circle.
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

export function getAppKitLoadError(): string | null {
  return loadError;
}

async function loadBrowserKitKey(): Promise<string> {
  if (browserKitKey) return browserKitKey;

  const response = await fetch("/api/kit", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const data = (await response.json().catch(() => null)) as
    | { kitKey?: string | null; configured?: boolean; valid?: boolean | null; message?: string }
    | null;

  const key = typeof data?.kitKey === "string" ? data.kitKey.trim() : "";
  if (!response.ok || !key) {
    throw new Error(
      data?.message ||
        "Circle Kit key is not configured. Add KIT_KEY to Vercel Production and redeploy.",
    );
  }

  if (!/^KIT_KEY:[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+$/.test(key)) {
    throw new Error("Circle Kit key has an invalid format. Expected KIT_KEY:id:secret.");
  }

  browserKitKey = key;
  return key;
}

export async function getBrowserKitKey(): Promise<string> {
  if (typeof window === "undefined") throw new Error("Kit key is browser-only.");
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

    kitSingleton = new AppKitCtor({
      kitKey,
      disableErrorReporting: true,
    });
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
  loadError = null;
}
