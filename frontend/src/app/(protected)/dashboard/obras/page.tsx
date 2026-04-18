'use client';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { Home, Edit2, Trash2, Plus, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ObraFormModal, type ObraFormData } from '@/components/ObraFormModal';

interface Obra {
  id: number;
  name: string;
  type: 'PUBLICA' | 'PARTICULAR';
  status: 'AGUARDANDO_RECURSOS' | 'AGUARDANDO_CONTRATO' | 'AGUARDANDO_OS' | 'NAO_INICIADA' | 'EM_ANDAMENTO' | 'PARADA' | 'FINALIZADA';
  enderecoObra?: {
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    latitude?: string | null;
    longitude?: string | null;
  } | null;
}

const STATUS_MAP = {
  AGUARDANDO_RECURSOS: 'Aguardando recursos',
  AGUARDANDO_CONTRATO: 'Aguardando assinatura do contrato',
  AGUARDANDO_OS: 'Aguardando OS',
  NAO_INICIADA: 'Não iniciada',
  EM_ANDAMENTO: 'Em andamento',
  PARADA: 'Parada',
  FINALIZADA: 'Finalizada',
} as const;

const TYPE_MAP = {
  PUBLICA: 'Pública',
  PARTICULAR: 'Particular',
} as const;

const STATUS_COLOR_MAP: Record<string, string> = {
  AGUARDANDO_RECURSOS: 'bg-yellow-100 text-yellow-800',
  AGUARDANDO_CONTRATO: 'bg-yellow-100 text-yellow-800',
  AGUARDANDO_OS: 'bg-orange-100 text-orange-800',
  NAO_INICIADA: 'bg-gray-100 text-gray-800',
  EM_ANDAMENTO: 'bg-green-100 text-green-800',
  PARADA: 'bg-red-100 text-red-800',
  FINALIZADA: 'bg-blue-100 text-blue-800',
};

export default function ObrasPage() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);

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
    const obraPayload: any = {
      name: data.name,
      type: data.type,
      status: data.status,
      description: data.description,
      valorPrevisto: data.valorPrevisto,
    };
    const enderecoPayload: any = {
      origem: 'MANUAL',
      cep: data.cep,
      logradouro: data.logradouro,
      numero: data.numero,
      complemento: data.complemento,
      bairro: data.bairro,
      cidade: data.cidade,
      uf: data.uf,
      latitude: data.latitude,
      longitude: data.longitude,
    };
    const hasEndereco =
      !!(enderecoPayload.cep || enderecoPayload.logradouro || enderecoPayload.numero || enderecoPayload.bairro || enderecoPayload.cidade || enderecoPayload.uf || enderecoPayload.latitude || enderecoPayload.longitude);
    if (editingObra) {
      await api.put(`/api/obras/${editingObra.id}`, obraPayload);
      if (hasEndereco) {
        await api.put(`/api/obras/${editingObra.id}/endereco`, enderecoPayload);
      }
    } else {
      const created = await api.post('/api/obras', obraPayload);
      const id = Number(created.data?.id || created.data?.data?.id || created.data?.obra?.id || 0);
      if (hasEndereco && id > 0) {
        await api.put(`/api/obras/${id}/endereco`, enderecoPayload);
      }
    }
    fetchObras();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta obra?')) return;
    try {
      await api.delete(`/api/obras/${id}`);
      fetchObras();
    } catch (error) {
      console.error('Error deleting obra', error);
      alert('Erro ao excluir obra');
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
          headers: { 'Content-Type': 'multipart/form-data' },
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
    <div>
      <div className="flex items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cadastro de Obras</h1>
        <button onClick={openNewModal} className="ml-[20px] px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors shadow-sm flex items-center">
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#{obra.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{obra.name}</div>
                      <div className="text-xs text-gray-500">
                        {obra.enderecoObra?.logradouro
                          ? `${obra.enderecoObra.logradouro}, ${obra.enderecoObra.numero || ''} - ${obra.enderecoObra.cidade || ''}/${obra.enderecoObra.uf || ''}`
                          : 'Sem endereço'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{TYPE_MAP[obra.type] || obra.type}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={cn(
                          'px-2 inline-flex text-xs leading-5 font-semibold rounded-full',
                          STATUS_COLOR_MAP[obra.status] || 'bg-gray-100 text-gray-800'
                        )}
                      >
                        {STATUS_MAP[obra.status] || obra.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => openEditModal(obra)} className="text-blue-600 hover:text-blue-900 mr-4" title="Editar">
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button onClick={() => handleDelete(obra.id)} className="text-red-600 hover:text-red-900" title="Excluir">
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

      <ObraFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateOrUpdate}
        initialData={
          editingObra
            ? {
                name: editingObra.name,
                type: editingObra.type,
                status: editingObra.status,
                logradouro: editingObra.enderecoObra?.logradouro || '',
                numero: editingObra.enderecoObra?.numero || '',
                bairro: editingObra.enderecoObra?.bairro || '',
                cidade: editingObra.enderecoObra?.cidade || '',
                uf: editingObra.enderecoObra?.uf || '',
                cep: editingObra.enderecoObra?.cep || '',
                complemento: editingObra.enderecoObra?.complemento || '',
                latitude: editingObra.enderecoObra?.latitude || '',
                longitude: editingObra.enderecoObra?.longitude || '',
              }
            : undefined
        }
        title={editingObra ? 'Editar Obra' : 'Nova Obra'}
      />
    </div>
  );
}
