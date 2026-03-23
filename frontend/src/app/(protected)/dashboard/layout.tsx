import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/auth/current-user';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AppSidebar user={user} />
      <div className="flex-1 min-w-0">
        <AppHeader user={user} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
