'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import api from '@/lib/api';
import { Filter } from 'lucide-react';

const MapaObras = dynamic(() => import('@/components/MapaObras'), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] w-full bg-gray-100 animate-pulse rounded-lg flex items-center justify-center text-gray-400">
      Carregando mapa...
    </div>
  ),
});

interface Obra {
  id: number;
  name: string;
  type: 'PUBLICA' | 'PARTICULAR';
  status: 'AGUARDANDO_RECURSOS' | 'AGUARDANDO_CONTRATO' | 'AGUARDANDO_OS' | 'NAO_INICIADA' | 'EM_ANDAMENTO' | 'PARADA' | 'FINALIZADA';
  address?: string;
  latitude?: string;
  longitude?: string;
  valorPrevisto?: number;
}

export default function ObrasMapaPage() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [typeFilter, setTypeFilter] = useState<string>('TODOS');

  useEffect(() => {
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
    fetchObras();
  }, []);

  const filteredObras = obras.filter((obra) => {
    const matchesStatus = statusFilter === 'TODOS' || obra.status === statusFilter;
    const matchesType = typeFilter === 'TODOS' || obra.type === typeFilter;
    return matchesStatus && matchesType;
  });

  return (
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
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white"
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
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white"
          >
            <option value="TODOS">Todos os Tipos</option>
            <option value="PUBLICA">Pública</option>
            <option value="PARTICULAR">Particular</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <MapaObras obras={filteredObras} />
      )}
    </div>
  );
}

