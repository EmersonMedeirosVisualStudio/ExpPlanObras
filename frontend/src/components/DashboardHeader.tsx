'use client';

import { UserMenu } from '@/components/UserMenu';
import { useState } from 'react';

export function DashboardHeader() {
  const [companyName] = useState(() => {
    if (typeof window === 'undefined') return '';
    const userStr = localStorage.getItem('user');
    if (!userStr) return '';
    try {
      const user = JSON.parse(userStr) as { tenants?: Array<{ name?: string }>; isSystemAdmin?: boolean };
      if (Array.isArray(user.tenants) && user.tenants.length > 0) {
        return String(user.tenants[0]?.name || '');
      }
      if (user.isSystemAdmin) return 'Administração do Sistema';
      return '';
    } catch {
      return '';
    }
  });

  return (
    <nav className="bg-white shadow-sm border-b z-20 relative w-full">
      <div className="flex h-16 items-center">
        {/* Logo Section - Aligned with Sidebar width on Desktop */}
        <div className="flex-shrink-0 flex items-center px-6 md:w-64 transition-all">
           <img src="/LogoDoSistema.jpg" alt="ExpPlanObras Logo" className="h-12 w-auto -ml-6" />
        </div>
        
        {/* Content Section - Aligned with Main Content */}
        <div className="flex-1 flex items-center justify-between px-4 md:px-8">
           <div className="flex items-center">
             {companyName && (
                <span className="text-2xl font-bold text-gray-900 truncate">{companyName}</span>
             )}
           </div>
           
           <div className="ml-auto">
              <UserMenu />
           </div>
        </div>
      </div>
    </nav>
  );
}
