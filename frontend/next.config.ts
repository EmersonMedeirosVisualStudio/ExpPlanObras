import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3333";
    const apiMode = String(process.env.NEXT_PUBLIC_API_MODE || process.env.API_MODE || "").trim().toLowerCase();
    const backendOnly = apiMode !== "next";

    const localRules = [
      { source: "/api/v1/me/:path*", destination: "/api/v1/me/:path*" },
      { source: "/api/v1/realtime/:path*", destination: "/api/v1/realtime/:path*" },
      { source: "/api/v1/rh/:path*", destination: "/api/v1/rh/:path*" },
      { source: "/api/v1/dashboard/rh/:path*", destination: "/api/v1/dashboard/rh/:path*" },
      { source: "/api/v1/dashboard/engenharia/:path*", destination: "/api/v1/dashboard/engenharia/:path*" },
      { source: "/api/v1/dashboard/me/:path*", destination: "/api/v1/dashboard/me/:path*" },
      { source: "/api/v1/pes/:path*", destination: "/api/v1/pes/:path*" },
      { source: "/api/v1/engenharia/obras/responsaveis/:path*", destination: "/api/v1/engenharia/obras/responsaveis/:path*" },
      { source: "/api/v1/engenharia/obras/projetos/:path*", destination: "/api/v1/engenharia/obras/projetos/:path*" },
      { source: "/api/v1/engenharia/projetos/:path*", destination: "/api/v1/engenharia/projetos/:path*" },
    ];

    const rules = [
      { source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` },
      { source: "/api/auth/:path*", destination: `${apiOrigin}/api/auth/:path*` },
      { source: "/api/admin/:path*", destination: `${apiOrigin}/api/admin/:path*` },
      { source: "/api/geo/:path*", destination: `${apiOrigin}/api/geo/:path*` },
      { source: "/api/obras/:path*", destination: `${apiOrigin}/api/obras/:path*` },
      { source: "/api/billing/:path*", destination: `${apiOrigin}/api/billing/:path*` },
      { source: "/api/maintenance/:path*", destination: `${apiOrigin}/api/maintenance/:path*` },
    ];
    return {
      beforeFiles: backendOnly ? [...localRules, ...rules] : localRules,
      afterFiles: [],
      fallback: backendOnly ? [] : rules,
    };
  },
};

export default nextConfig;
