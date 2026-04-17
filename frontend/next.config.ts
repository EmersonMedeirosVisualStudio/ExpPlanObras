import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3333";
    const apiMode = String(process.env.NEXT_PUBLIC_API_MODE || process.env.API_MODE || "").trim().toLowerCase();
    const backendOnly = apiMode === "backend";

    const rules = [
      { source: "/api/v1/dashboard/me/filtros", destination: "/api/_internal/v1/dashboard/me/filtros" },
      { source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` },
      { source: "/api/auth/:path*", destination: `${apiOrigin}/api/auth/:path*` },
      { source: "/api/admin/:path*", destination: `${apiOrigin}/api/admin/:path*` },
      { source: "/api/geo/:path*", destination: `${apiOrigin}/api/geo/:path*` },
      { source: "/api/obras/:path*", destination: `${apiOrigin}/api/obras/:path*` },
      { source: "/api/billing/:path*", destination: `${apiOrigin}/api/billing/:path*` },
      { source: "/api/maintenance/:path*", destination: `${apiOrigin}/api/maintenance/:path*` },
    ];
    return {
      beforeFiles: backendOnly ? rules : [],
      afterFiles: [],
      fallback: backendOnly ? [] : rules,
    };
  },
};

export default nextConfig;
