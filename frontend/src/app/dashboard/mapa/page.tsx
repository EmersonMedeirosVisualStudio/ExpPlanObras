
'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import api from '@/lib/api';
import { Loader2, Filter } from 'lucide-react';
import { DashboardHeader } from '@/components/DashboardHeader';
import { DashboardSidebar } from '@/components/DashboardSidebar';

// Dynamically import MapaObras to avoid SSR issues with Leaflet
const MapaObras = dynamic(() => import('@/components/MapaObras'), {
  ssr: false,
  loading: () => <div className="h-[600px] w-full bg-gray-100 animate-pulse rounded-lg flex items-center justify-center text-gray-400">Carregando mapa...</div>
});

interface Obra {
  id: number;
  name: string;
  type: 'PUBLICA' | 'PARTICULAR';
  status: 'AGUARDANDO_RECURSOS' | 'AGUARDANDO_CONTRATO' | 'AGUARDANDO_OS' | 'NAO_INICIADA' | 'EM_ANDAMENTO' | 'PARADA' | 'FINALIZADA';
  address?: string;
  latitude?: string;
  longitude?: string;
}

export default function MapaPage() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('mapa'); // 'mapa' to highlight sidebar
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [typeFilter, setTypeFilter] = useState<string>('TODOS');

  useEffect(() => {
    fetchObras();
  }, []);

  const fetchObras = async () => {
    try {
      const response = await api.get('/api/obras');
      setObras(response.data);
    } catch (error) {
      console.error('Failed to fetch obras', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredObras = obras.filter(obra => {
      const matchesStatus = statusFilter === 'TODOS' || obra.status === statusFilter;
      const matchesType = typeFilter === 'TODOS' || obra.type === typeFilter;
      return matchesStatus && matchesType;
  });

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <DashboardHeader />

      <div className="flex flex-1 overflow-hidden">
        <DashboardSidebar currentView={currentView} setCurrentView={(view) => {
            // If user clicks other items, we might need to redirect since this is a separate page
            // But DashboardSidebar logic currently just calls setCurrentView.
            // We need to check how DashboardSidebar handles navigation. 
            // If it's just state, we might need to redirect to /dashboard if view != 'mapa'
            if (view !== 'mapa') {
                window.location.href = `/dashboard?view=${view}`;
            }
        }} />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8 bg-gray-50">
            <div className="flex flex-col space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h1 className="text-2xl font-bold text-gray-900">Mapa das Obras</h1>
                    
                    <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-lg shadow-sm border">
                        <div className="flex items-center text-gray-500 mr-2">
                            <Filter className="w-4 h-4 mr-2" />
                            <span className="text-sm font-medium">Filtros:</span>
                        </div>
                        
                        <select 
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            <option value="TODOS">Todos os Status</option>
                            <option value="AGUARDANDO_RECURSOS">Aguardando recursos</option>
                            <option value="AGUARDANDO_CONTRATO">Aguardando contrato</option>
                            <option value="AGUARDANDO_OS">Aguardando OS</option>
                            <option value="NAO_INICIADA">Não iniciada</option>
                            <option value="EM_ANDAMENTO">Em andamento</option>
                            <option value="PARADA">Parada</option>
                            <option value="FINALIZADA">Finalizada</option>
                        </select>

                        <select 
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            <option value="TODOS">Todos os Tipos</option>
                            <option value="PUBLICA">Pública</option>
                            <option value="PARTICULAR">Particular</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    </div>
                ) : (
                    <div className="bg-white p-1 rounded-lg shadow border">
                        <MapaObras obras={filteredObras} />
                    </div>
                )}
            </div>
        </main>
      </div>
    </div>
  );
}
