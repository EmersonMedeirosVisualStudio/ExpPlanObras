
import { Home, Calendar, Hammer, FileText, Map, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface DashboardSidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

export function DashboardSidebar({ currentView, setCurrentView }: DashboardSidebarProps) {
  const router = useRouter();

  const menuItems = [
    { id: 'obras', label: 'Cadastro de Obra', icon: Home, path: '/dashboard' },
    { id: 'mapa', label: 'Mapa das Obras', icon: Map, path: '/dashboard/mapa' },
    { id: 'orcamentos', label: 'Orçamentos', icon: DollarSign, path: null },
    { id: 'planejamento', label: 'Planejamento', icon: Calendar, path: null },
    { id: 'execucao', label: 'Execução', icon: Hammer, path: null },
    { id: 'relatorios', label: 'Relatórios', icon: FileText, path: null },
  ];

  const handleNavigation = (id: string, path: string | null) => {
    setCurrentView(id);
    if (path) {
        if (id === 'obras' && window.location.pathname.includes('/mapa')) {
            router.push('/dashboard');
        } else if (id === 'mapa' && !window.location.pathname.includes('/mapa')) {
            router.push('/dashboard/mapa');
        }
    }
  };

  return (
    <aside className="w-64 bg-white shadow-md hidden md:block flex-shrink-0 overflow-y-auto border-r border-gray-200">
        <div className="p-4 space-y-2">
            {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                    <button
                        key={item.id}
                        onClick={() => handleNavigation(item.id, item.path)}
                        className={cn(
                            "w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors",
                            currentView === item.id 
                                ? "bg-blue-50 text-blue-700 font-medium" 
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        )}
                    >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                    </button>
                )
            })}
        </div>
    </aside>
  );
}
