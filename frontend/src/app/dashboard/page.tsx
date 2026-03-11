'use client';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { Home, Calendar, Hammer, FileText, Edit2, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardHeader } from '@/components/DashboardHeader';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { ObraFormModal, ObraFormData } from '@/components/ObraFormModal';
import { Upload } from 'lucide-react';
import { Save } from 'lucide-react';

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
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.style.display = 'none';
    document.body.appendChild(input);
    fileInputRef.current = input;
    return () => {
      input.remove();
      fileInputRef.current = null;
    };
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

  const triggerImport = () => {
    const el = fileInputRef.current;
    if (!el) return;
    el.value = '';
    el.onchange = async () => {
      const file = el.files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        await api.post('/api/obras/import', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        await fetchObras();
        alert('Importação concluída');
      } catch {
        alert('Falha na importação do CSV');
      } finally {
        setImporting(false);
      }
    };
    el.click();
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
            {currentView === 'orcamentos' && (
              <OrcamentosView />
            )}
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
                      <a
                        href="/modelo-obras.csv"
                        download
                        className="ml-3 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors shadow-sm flex items-center"
                        title="Baixar modelo CSV"
                      >
                        Modelo CSV
                      </a>
                      <button
                        onClick={triggerImport}
                        disabled={importing}
                        className="ml-3 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors shadow-sm flex items-center disabled:opacity-60"
                        title="Importar obras via CSV"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {importing ? 'Importando...' : 'Importar CSV'}
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

function OrcamentosView() {
  const [obras, setObras] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [orcamento, setOrcamento] = useState<null | {
    obra: { id: number; name: string; valorPrevisto?: number };
    totalGasto: number;
    saldo: number;
    custos: Array<{ id: number; description: string; amount: number; date: string }>;
  }>(null);
  const [novoValor, setNovoValor] = useState<string>('');
  const [custoDesc, setCustoDesc] = useState('');
  const [custoValor, setCustoValor] = useState('');
  const [custoData, setCustoData] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/api/obras');
        const data = res.data as unknown;
        const list = Array.isArray(data) ? data : [];
        setObras(
          list.map((o) => {
            const obj = (typeof o === 'object' && o) ? (o as { id?: unknown; name?: unknown }) : {};
            return { id: Number(obj.id), name: String(obj.name || '') };
          })
        );
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  const fetchOrcamento = async (id: number) => {
    setLoading(true);
    try {
      const res = await api.get(`/api/obras/${id}/orcamento`);
      setOrcamento(res.data);
      setNovoValor(String(res.data.obra.valorPrevisto ?? ''));
    } catch (e) {
      console.error(e);
      alert('Falha ao carregar orçamento');
    } finally {
      setLoading(false);
    }
  };

  const onSelectObra = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    setSelectedId(id || null);
    if (id) fetchOrcamento(id);
  };

  const salvarOrcamento = async () => {
    if (!selectedId) return;
    const valor = Number(novoValor.replace(/\./g, '').replace(',', '.'));
    if (isNaN(valor)) {
      alert('Valor inválido');
      return;
    }
    try {
      const res = await api.put(`/api/obras/${selectedId}/orcamento`, { valorPrevisto: valor });
      setOrcamento(res.data);
      alert('Orçamento atualizado');
    } catch (e) {
      console.error(e);
      alert('Falha ao atualizar orçamento');
    }
  };

  const adicionarCusto = async () => {
    if (!selectedId) return;
    const valor = Number(custoValor.replace(/\./g, '').replace(',', '.'));
    if (!custoDesc || isNaN(valor)) {
      alert('Descrição e valor válidos são obrigatórios');
      return;
    }
    try {
      const res = await api.post(`/api/obras/${selectedId}/custos`, {
        description: custoDesc,
        amount: valor,
        date: custoData || undefined
      });
      setOrcamento(res.data);
      setCustoDesc('');
      setCustoValor('');
      setCustoData('');
    } catch (e) {
      console.error(e);
      alert('Falha ao adicionar custo');
    }
  };

  const removerCusto = async (custoId: number) => {
    if (!selectedId) return;
    try {
      const res = await api.delete(`/api/obras/${selectedId}/custos/${custoId}`);
      setOrcamento(res.data);
    } catch (e) {
      console.error(e);
      alert('Falha ao remover custo');
    }
  };

  return (
    <div>
      <div className="flex items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Orçamentos</h1>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Selecione a Obra</label>
            <select
              value={selectedId || ''}
              onChange={onSelectObra}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Escolha --</option>
              {obras.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          {orcamento && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Orçamento Previsto (R$)</label>
                <div className="flex gap-2">
                  <input
                    value={novoValor}
                    onChange={(e) => setNovoValor(e.target.value)}
                    placeholder="0,00"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={salvarOrcamento}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center"
                    title="Salvar"
                  >
                    <Save className="w-4 h-4 mr-1" /> Salvar
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-gray-50 rounded border">
                  <div className="text-xs text-gray-500">Total Gasto</div>
                  <div className="text-lg font-semibold text-gray-800">
                    R$ {orcamento.totalGasto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded border">
                  <div className="text-xs text-gray-500">Saldo</div>
                  <div className="text-lg font-semibold text-gray-800">
                    R$ {orcamento.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {loading && (
        <div className="py-6 text-gray-500">Carregando orçamento...</div>
      )}

      {orcamento && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Adicionar Custo</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Descrição</label>
                <input
                  value={custoDesc}
                  onChange={(e) => setCustoDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Valor (R$)</label>
                <input
                  value={custoValor}
                  onChange={(e) => setCustoValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Data</label>
                <input
                  type="date"
                  value={custoData}
                  onChange={(e) => setCustoData(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="pt-2">
                <button
                  onClick={adicionarCusto}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-800">Custos</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orcamento.custos.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(c.date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {c.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        R$ {Number(c.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button
                          onClick={() => removerCusto(c.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Remover"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {orcamento.custos.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-6 text-center text-sm text-gray-500">
                        Nenhum custo lançado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
