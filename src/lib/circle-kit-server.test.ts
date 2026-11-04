import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getServerKitKey } from "@/lib/circle-kit-server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getServerKitKey server-only credential resolution", () => {
  it("ignores NEXT_PUBLIC_KIT_KEY when no server credential exists", () => {
    vi.stubEnv("KIT_KEY", "");
    vi.stubEnv("CIRCLE_KIT_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_KIT_KEY", "KIT_KEY:public-id:public-secret");

    expect(getServerKitKey()).toBeNull();
  });

  it("accepts the server-scoped KIT_KEY", () => {
    vi.stubEnv("KIT_KEY", "KIT_KEY:server-id:server-secret");
    vi.stubEnv("CIRCLE_KIT_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_KIT_KEY", "KIT_KEY:public-id:public-secret");

    expect(getServerKitKey()).toBe("KIT_KEY:server-id:server-secret");
  });

  it("supports the legacy server-scoped CIRCLE_KIT_KEY fallback", () => {
    vi.stubEnv("KIT_KEY", "");
    vi.stubEnv("CIRCLE_KIT_KEY", "KIT_KEY:circle-id:circle-secret");
    vi.stubEnv("NEXT_PUBLIC_KIT_KEY", "");

    expect(getServerKitKey()).toBe("KIT_KEY:circle-id:circle-secret");
  });

  it("prefers KIT_KEY over CIRCLE_KIT_KEY", () => {
    vi.stubEnv("KIT_KEY", "KIT_KEY:primary-id:primary-secret");
    vi.stubEnv("CIRCLE_KIT_KEY", "KIT_KEY:legacy-id:legacy-secret");

    expect(getServerKitKey()).toBe("KIT_KEY:primary-id:primary-secret");
  });

  it("rejects malformed server credentials", () => {
    vi.stubEnv("KIT_KEY", "not-a-circle-key");
    vi.stubEnv("CIRCLE_KIT_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_KIT_KEY", "");

    expect(getServerKitKey()).toBeNull();
  });
});
