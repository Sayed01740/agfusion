import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingRoot: path.join(__dirname),
  // Bundle Circle kits for the browser (swap / bridge / unified balance)
  transpilePackages: [
    "@circle-fin/app-kit",
    "@circle-fin/adapter-viem-v2",
    "@circle-fin/swap-kit",
    "@circle-fin/bridge-kit",
    "@circle-fin/unified-balance-kit",
    "@circle-fin/provider-gateway-v1",
    "@circle-fin/earn-kit",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "recharts"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

export default nextConfig;
