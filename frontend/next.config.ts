import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [],
  experimental: {
    proxyTimeout: 600_000, // 10 min for long AI responses (matches nginx)
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
        // Upstream del proxy: in produzione (Docker) resta il nome servizio
        // Compose `backend:8000`; in sviluppo sull'host si imposta
        // BACKEND_ORIGIN=http://127.0.0.1:8001 senza toccare il Dockerfile.
        destination: `${process.env.BACKEND_ORIGIN || "http://backend:8000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
