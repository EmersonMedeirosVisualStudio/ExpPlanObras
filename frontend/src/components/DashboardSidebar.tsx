
import { cn } from '@/lib/utils';
import { usePathname, useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import { useMemo, useState } from 'react';
import { MENU, type MenuItem } from '@/lib/menuConfig';

interface DashboardSidebarProps {
  setCurrentView?: (view: string) => void;
}

function getActiveProfileCode() {
  try {
    const v = localStorage.getItem('active_profile');
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

export function DashboardSidebar({ setCurrentView }: DashboardSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({ Obras: pathname.startsWith('/dashboard/obras') }));

  const menuItems = useMemo<MenuItem[]>(() => {
    if (typeof window === 'undefined') return MENU;
    const profile = getActiveProfileCode();
    if (profile === 'ENCARREGADO_SISTEMA_EMPRESA') {
      return MENU.filter((i) => i.label === 'Administração da Empresa');
    }
    if (profile === 'REPRESENTANTE_EMPRESA' || profile === 'CEO') {
      return MENU.filter((i) => ['Dashboard', 'Obras', 'Configuração da Empresa', 'Organograma', 'Relatórios'].includes(i.label));
    }
    return MENU;
  }, []);

  const isActive = (path?: string) => {
    if (!path) return false;
    if (path === '/dashboard') return pathname === '/dashboard';
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const go = (id: string, path?: string) => {
    if (setCurrentView) setCurrentView(id);
    if (path) router.push(path);
  };

  return (
    <aside
      className={cn(
        'bg-white shadow-md hidden md:block flex-shrink-0 overflow-y-auto border-r border-gray-200 transition-all',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="p-4 space-y-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="w-full px-3 py-2 border rounded text-gray-700 hover:bg-gray-50 text-sm"
          title="Colapsar/expandir"
        >
          {collapsed ? '»' : '«'}
        </button>

        {menuItems.map((item) => {
          const Icon = item.icon as ComponentType<{ className?: string }> | undefined;
          const active = isActive(item.path) || (item.children ? item.children.some((c) => isActive(c.path)) : false);

          if (item.children && item.children.length > 0) {
            const open = Boolean(expanded[item.label]) || active;
            return (
              <div key={item.label} className="space-y-1">
                <button
                  type="button"
                  onClick={() => setExpanded((p) => ({ ...p, [item.label]: !open }))}
                  className={cn(
                    'w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors',
                    active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                  title={item.label}
                >
                  {Icon ? <Icon className="h-5 w-5" /> : null}
                  {collapsed ? null : <span className="flex-1">{item.label}</span>}
                  {collapsed ? null : <span className="text-xs">{open ? '−' : '+'}</span>}
                </button>
                {open && !collapsed && (
                  <div className="pl-11 space-y-1">
                    {item.children.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => go(c.label, c.path)}
                        className={cn(
                          'w-full flex items-center px-4 py-2 rounded-lg text-left transition-colors text-sm',
                          isActive(c.path) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => go(item.label, item.path)}
              className={cn(
                'w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors',
                active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
              title={item.label}
            >
              {Icon ? <Icon className="h-5 w-5" /> : null}
              {collapsed ? null : <span>{item.label}</span>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
