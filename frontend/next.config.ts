import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [],
  experimental: {
    proxyTimeout: 300_000, // 5 min for long AI responses
  },
  async redirects() {
    return [
      {
        source: "/counselorbot",
        destination: "/",
        permanent: true,
      },
      {
        source: "/counselorbot/:path*",
        destination: "/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://backend:8000/:path*", // Proxy to Backend container
      },
    ];
  },
};

export default nextConfig;
