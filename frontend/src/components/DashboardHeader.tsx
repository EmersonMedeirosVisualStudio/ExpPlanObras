'use client';

import { UserMenu } from '@/components/UserMenu';
import { useState } from 'react';

export function DashboardHeader() {
  const [state, setState] = useState(() => {
    if (typeof window === 'undefined') {
      return {
        companyName: '',
        userName: '',
        profiles: [] as string[],
        activeProfile: '',
        activeContext: 'EMPRESA' as 'EMPRESA' | 'OBRA' | 'UNIDADE',
      };
    }
    const userStr = localStorage.getItem('user');
    const activeProfile = localStorage.getItem('active_profile') || '';
    const rawContext = localStorage.getItem('active_context') || 'EMPRESA';
    const activeContext = rawContext === 'OBRA' || rawContext === 'UNIDADE' ? rawContext : 'EMPRESA';
    let companyName = '';
    let userName = '';
    let isSystemAdmin = false;
    try {
      const parsed: unknown = userStr ? JSON.parse(userStr) : null;
      const user = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
      isSystemAdmin = Boolean(user && user['isSystemAdmin']);
      userName = String((user && (user['name'] || user['email'])) || '');
      const tenants = user ? user['tenants'] : null;
      if (Array.isArray(tenants) && tenants.length > 0) {
        const first = typeof tenants[0] === 'object' && tenants[0] !== null ? (tenants[0] as Record<string, unknown>) : null;
        companyName = String((first && first['name']) || '');
      } else if (isSystemAdmin) {
        companyName = 'Administração do Sistema';
      }
    } catch {
    }

    let profiles: string[] = [];
    try {
      const raw = localStorage.getItem('available_profiles');
      const parsed = raw ? JSON.parse(raw) : null;
      profiles = Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
    } catch {
    }
    if (profiles.length === 0 && !isSystemAdmin) {
      profiles = ['REPRESENTANTE_EMPRESA', 'CEO', 'ENCARREGADO_SISTEMA_EMPRESA'];
    }
    if (profiles.length === 0 && isSystemAdmin) {
      profiles = ['SYSTEM_ADMIN'];
    }

    const resolvedProfile = activeProfile && profiles.includes(activeProfile) ? activeProfile : profiles[0] || '';
    if (resolvedProfile && resolvedProfile !== activeProfile) {
      try {
        localStorage.setItem('active_profile', resolvedProfile);
      } catch {
      }
    }

    return {
      companyName,
      userName,
      profiles,
      activeProfile: resolvedProfile,
      activeContext,
    };
  });

  const setActiveProfile = (profile: string) => {
    try {
      localStorage.setItem('active_profile', profile);
    } catch {
    }
    setState((p) => ({ ...p, activeProfile: profile }));
  };

  const setActiveContext = (ctx: 'EMPRESA' | 'OBRA' | 'UNIDADE') => {
    try {
      localStorage.setItem('active_context', ctx);
    } catch {
    }
    setState((p) => ({ ...p, activeContext: ctx }));
  };

  return (
    <nav className="bg-white shadow-sm border-b z-20 relative w-full">
      <div className="flex h-16 items-center">
        {/* Logo Section - Aligned with Sidebar width on Desktop */}
        <div className="flex-shrink-0 flex items-center px-6 md:w-64 transition-all">
           <img src="/LogoDoSistema.jpg" alt="ExpPlanObras Logo" className="h-12 w-auto -ml-6" />
        </div>
        
        {/* Content Section - Aligned with Main Content */}
        <div className="flex-1 flex items-center justify-between px-4 md:px-8">
           <div className="flex items-center gap-4 min-w-0">
             {state.companyName && (
                <span className="text-2xl font-bold text-gray-900 truncate">{state.companyName}</span>
             )}
             <div className="hidden lg:flex items-center gap-3">
                <div className="text-sm text-gray-700">
                  {state.userName ? <span className="font-medium">{state.userName}</span> : null}
                </div>
                {state.profiles.length > 0 && (
                  <label className="text-sm text-gray-700 flex items-center gap-2">
                    <span>Perfil</span>
                    <select
                      value={state.activeProfile}
                      onChange={(e) => setActiveProfile(e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                    >
                      {state.profiles.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="text-sm text-gray-700 flex items-center gap-2">
                  <span>Contexto</span>
                  <select
                    value={state.activeContext}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'EMPRESA' || v === 'OBRA' || v === 'UNIDADE') setActiveContext(v);
                    }}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value="EMPRESA">Empresa</option>
                    <option value="OBRA">Obra</option>
                    <option value="UNIDADE">Unidade</option>
                  </select>
                </label>
             </div>
           </div>
           
           <div className="ml-auto">
              <UserMenu />
           </div>
        </div>
      </div>
    </nav>
  );
}
