import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3333";
    const apiMode = String(process.env.NEXT_PUBLIC_API_MODE || process.env.API_MODE || "").trim().toLowerCase();
    const useNextApi = apiMode === "next";
    const localRules = [
      { source: "/api/v1/me/:path*", destination: "/api/v1/me/:path*" },
      { source: "/api/v1/realtime/:path*", destination: "/api/v1/realtime/:path*" },
      { source: "/api/v1/rh/:path*", destination: "/api/v1/rh/:path*" },
      { source: "/api/v1/dashboard/rh/:path*", destination: "/api/v1/dashboard/rh/:path*" },
      { source: "/api/v1/dashboard/engenharia/:path*", destination: "/api/v1/dashboard/engenharia/:path*" },
      { source: "/api/v1/dashboard/me/:path*", destination: "/api/v1/dashboard/me/:path*" },
      { source: "/api/v1/pes/:path*", destination: "/api/v1/pes/:path*" },
      { source: "/api/v1/engenharia/tecnicos/:path*", destination: "/api/v1/engenharia/tecnicos/:path*" },
      { source: "/api/v1/engenharia/obras/responsaveis/:path*", destination: "/api/v1/engenharia/obras/responsaveis/:path*" },
      { source: "/api/v1/engenharia/obras/responsabilidades/:path*", destination: "/api/v1/engenharia/obras/responsabilidades/:path*" },
      { source: "/api/v1/engenharia/obras/projetos/:path*", destination: "/api/v1/engenharia/obras/projetos/:path*" },
      { source: "/api/v1/engenharia/projetos/:path*", destination: "/api/v1/engenharia/projetos/:path*" },
      { source: "/api/v1/engenharia/obras/:id/planilha/:path*", destination: "/api/v1/engenharia/obras/:id/planilha/:path*" },
      { source: "/api/v1/engenharia/obras/:id/planilha", destination: "/api/v1/engenharia/obras/:id/planilha" },
      { source: "/api/v1/documentos/:path*", destination: "/api/v1/documentos/:path*" },
      { source: "/api/v1/documentos", destination: "/api/v1/documentos" },
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

    const proxyRulesBeforeFiles = [
      { source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` },
    ];
    return {
      beforeFiles: useNextApi ? [...localRules] : [...proxyRulesBeforeFiles],
      afterFiles: [],
      fallback: rules,
    };
  },
};

export default nextConfig;
