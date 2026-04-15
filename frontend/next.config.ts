import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3333";
    return {
      beforeFiles: [
        { source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` },
        { source: "/api/auth/:path*", destination: `${apiOrigin}/api/auth/:path*` },
        { source: "/api/admin/:path*", destination: `${apiOrigin}/api/admin/:path*` },
        { source: "/api/geo/:path*", destination: `${apiOrigin}/api/geo/:path*` },
        { source: "/api/obras/:path*", destination: `${apiOrigin}/api/obras/:path*` },
        { source: "/api/billing/:path*", destination: `${apiOrigin}/api/billing/:path*` },
        { source: "/api/maintenance/:path*", destination: `${apiOrigin}/api/maintenance/:path*` },
        { source: "/health", destination: `${apiOrigin}/health` },
        { source: "/health/db", destination: `${apiOrigin}/health/db` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
