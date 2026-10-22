import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal self-contained server for the Aiven Runtime container.
  output: "standalone",
  // Label photos are capped at 4 MB in lib/cases.ts; leave room for multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
