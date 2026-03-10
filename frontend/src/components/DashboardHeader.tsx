'use client';

import { UserMenu } from '@/components/UserMenu';
import { useEffect, useState } from 'react';

export function DashboardHeader() {
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.tenants && user.tenants.length > 0) {
            setCompanyName(user.tenants[0].name);
        } else if (user.isSystemAdmin) {
            setCompanyName('Administração do Sistema');
        }
      } catch (e) {
        console.error("Error parsing user from localstorage", e);
      }
    }
  }, []);

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
