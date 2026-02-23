import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: "/counselorbot",
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
