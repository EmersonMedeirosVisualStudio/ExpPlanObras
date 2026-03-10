'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { Home, Calendar, Hammer, FileText, Edit2, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardHeader } from '@/components/DashboardHeader';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { ObraFormModal, ObraFormData } from '@/components/ObraFormModal';

interface Obra {
  id: number;
  name: string;
  type: 'PUBLICA' | 'PARTICULAR';
  status: 'AGUARDANDO_RECURSOS' | 'AGUARDANDO_CONTRATO' | 'AGUARDANDO_OS' | 'NAO_INICIADA' | 'EM_ANDAMENTO' | 'PARADA' | 'FINALIZADA';
  address?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  latitude?: string;
  longitude?: string;
}

const STATUS_MAP = {
  AGUARDANDO_RECURSOS: "Aguardando recursos",
  AGUARDANDO_CONTRATO: "Aguardando assinatura do contrato",
  AGUARDANDO_OS: "Aguardando OS",
  NAO_INICIADA: "Não iniciada",
  EM_ANDAMENTO: "Em andamento",
  PARADA: "Parada",
  FINALIZADA: "Finalizada"
};

const TYPE_MAP = {
  PUBLICA: "Pública",
  PARTICULAR: "Particular"
};

const STATUS_COLOR_MAP = {
  AGUARDANDO_RECURSOS: "bg-yellow-100 text-yellow-800",
  AGUARDANDO_CONTRATO: "bg-yellow-100 text-yellow-800",
  AGUARDANDO_OS: "bg-orange-100 text-orange-800",
  NAO_INICIADA: "bg-gray-100 text-gray-800",
  EM_ANDAMENTO: "bg-green-100 text-green-800",
  PARADA: "bg-red-100 text-red-800",
  FINALIZADA: "bg-blue-100 text-blue-800"
};

export default function DashboardPage() {
  const router = useRouter();
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('obras');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingObra, setEditingObra] = useState<Obra | null>(null);

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

  useEffect(() => {
    fetchObras();
  }, []);

  const handleCreateOrUpdate = async (data: ObraFormData) => {
    try {
      if (editingObra) {
        await api.put(`/api/obras/${editingObra.id}`, data);
      } else {
        await api.post('/api/obras', data);
      }
      fetchObras();
    } catch (error) {
      console.error("Error saving obra", error);
      throw error;
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta obra?')) return;
    try {
      await api.delete(`/api/obras/${id}`);
      fetchObras();
    } catch (error) {
      console.error("Error deleting obra", error);
      alert("Erro ao excluir obra");
    }
  };

  const openNewModal = () => {
    setEditingObra(null);
    setIsModalOpen(true);
  };

  const openEditModal = (obra: Obra) => {
    setEditingObra(obra);
    setIsModalOpen(true);
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <DashboardHeader />

      <div className="flex flex-1 overflow-hidden">
        <DashboardSidebar currentView={currentView} setCurrentView={setCurrentView} />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8 bg-gray-50">
            {currentView === 'obras' && (
                <div>
                    <div className="flex items-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">Obras</h1>
                        <button 
                            onClick={openNewModal}
                            className="ml-[20px] px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors shadow-sm flex items-center"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Nova Obra
                        </button>
                    </div>
                    
                    {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                    ) : (
                    <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
                        {obras.length === 0 ? (
                            <div className="text-center py-16">
                                <Home className="mx-auto h-12 w-12 text-gray-400" />
                                <p className="mt-2 text-sm text-gray-500">Nenhuma obra cadastrada.</p>
                                <p className="text-sm text-gray-500">Comece criando sua primeira obra.</p>
                            </div>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome da Obra</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {obras.map((obra) => (
                                        <tr key={obra.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                #{obra.id}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{obra.name}</div>
                                                <div className="text-xs text-gray-500">
                                                    {obra.street ? `${obra.street}, ${obra.number || ''} - ${obra.city}/${obra.state}` : obra.address || 'Sem endereço'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {TYPE_MAP[obra.type] || obra.type}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={cn(
                                                    "px-2 inline-flex text-xs leading-5 font-semibold rounded-full",
                                                    STATUS_COLOR_MAP[obra.status] || "bg-gray-100 text-gray-800"
                                                )}>
                                                    {STATUS_MAP[obra.status] || obra.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button 
                                                    onClick={() => openEditModal(obra)}
                                                    className="text-blue-600 hover:text-blue-900 mr-4"
                                                    title="Editar"
                                                >
                                                    <Edit2 className="w-5 h-5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(obra.id)}
                                                    className="text-red-600 hover:text-red-900"
                                                    title="Excluir"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    )}
                </div>
            )}

            {currentView === 'planejamento' && (
                <div className="text-center py-20">
                    <Calendar className="mx-auto h-16 w-16 text-gray-300 mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900">Planejamento</h2>
                    <p className="text-gray-500 mt-2">Módulo de planejamento em desenvolvimento.</p>
                </div>
            )}

            {currentView === 'execucao' && (
                <div className="text-center py-20">
                    <Hammer className="mx-auto h-16 w-16 text-gray-300 mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900">Execução</h2>
                    <p className="text-gray-500 mt-2">Acompanhamento de execução em desenvolvimento.</p>
                </div>
            )}

            {currentView === 'relatorios' && (
                <div className="text-center py-20">
                    <FileText className="mx-auto h-16 w-16 text-gray-300 mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900">Relatórios</h2>
                    <p className="text-gray-500 mt-2">Relatórios gerenciais em desenvolvimento.</p>
                </div>
            )}
        </main>
      </div>

      <ObraFormModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateOrUpdate}
        initialData={editingObra ? {
            name: editingObra.name,
            type: editingObra.type,
            status: editingObra.status,
            // address removed in favor of detailed fields
            street: editingObra.street,
            number: editingObra.number,
            neighborhood: editingObra.neighborhood,
            city: editingObra.city,
            state: editingObra.state,
            latitude: editingObra.latitude,
            longitude: editingObra.longitude
        } : undefined}
        title={editingObra ? "Editar Obra" : "Nova Obra"}
      />
    </div>
  );
}
