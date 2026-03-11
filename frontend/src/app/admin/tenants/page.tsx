
'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Loader2, Plus, Trash2, Edit2, CheckCircle, XCircle } from 'lucide-react';
import { UserMenu } from '@/components/UserMenu';

interface Tenant {
  id: number;
  name: string;
  slug: string;
  cnpj: string;
  status: string;
  users: { user: { name: string; email: string } }[];
}

function getApiErrorMessage(err: unknown) {
  if (typeof err !== 'object' || !err) return undefined;
  if (!('response' in err)) return undefined;
  const response = (err as { response?: unknown }).response;
  if (typeof response !== 'object' || !response) return undefined;
  if (!('data' in response)) return undefined;
  const data = (response as { data?: unknown }).data;
  if (typeof data !== 'object' || !data) return undefined;
  if (!('message' in data)) return undefined;
  const message = (data as { message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
}

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Create Form State
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    cnpj: '',
    representativeName: '',
    representativeEmail: '',
    representativeCpf: '',
    representativePassword: '',
    representativeWhatsapp: '',
    representativeAddress: '',
  });

  // Edit Form State
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
      name: '',
      slug: '',
      cnpj: '',
      status: ''
  });

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const response = await api.get('/api/admin/tenants');
      setTenants(response.data);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (tenant: Tenant) => {
      const newStatus = tenant.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      try {
          await api.put(`/api/admin/tenants/${tenant.id}`, { status: newStatus });
          fetchTenants();
      } catch {
          alert('Erro ao alterar status da empresa');
      }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta empresa?')) return;
    try {
        await api.delete(`/api/admin/tenants/${id}`);
        fetchTenants();
    } catch {
        alert('Erro ao excluir empresa');
    }
  };

  const handleGrantAccessDays = async (tenant: Tenant, days: 30 | 60 | 90 | 365) => {
    const label = days === 365 ? '1 ano' : `${days} dias`;
    if (!confirm(`Liberar acesso por ${label} para "${tenant.name}"?`)) return;
    try {
      await api.post(`/api/admin/tenants/${tenant.id}/grant-access`, { days });
      fetchTenants();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err) || 'Erro ao liberar acesso');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
      e.preventDefault();
      setCreating(true);
      setError('');
      try {
          await api.post('/api/admin/tenants', formData);
          setShowCreateModal(false);
          setFormData({
            name: '', slug: '', cnpj: '',
            representativeName: '', representativeEmail: '', representativeCpf: '',
            representativePassword: '', representativeWhatsapp: '', representativeAddress: ''
          });
          fetchTenants();
      } catch (err: unknown) {
          setError(getApiErrorMessage(err) || 'Erro ao criar empresa');
      } finally {
          setCreating(false);
      }
  };

  const handleEdit = (tenant: Tenant) => {
      setEditingTenant(tenant);
      setEditFormData({
          name: tenant.name,
          slug: tenant.slug,
          cnpj: tenant.cnpj,
          status: tenant.status
      });
      setShowEditModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingTenant) return;
      
      setCreating(true); // Reusing loading state
      try {
          await api.put(`/api/admin/tenants/${editingTenant.id}`, editFormData);
          setShowEditModal(false);
          setEditingTenant(null);
          fetchTenants();
      } catch {
          alert('Erro ao atualizar empresa');
      } finally {
          setCreating(false);
      }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let value = e.target.value;
      const name = e.target.name;

      if (name === 'cnpj') {
          value = value.replace(/\D/g, '');
          if (value.length > 14) value = value.substring(0, 14);
          value = value.replace(/^(\d{2})(\d)/, '$1.$2');
          value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
          value = value.replace(/\.(\d{3})(\d)/, '.$1/$2');
          value = value.replace(/(\d{4})(\d)/, '$1-$2');
      } else if (name === 'representativeCpf') {
          value = value.replace(/\D/g, '');
          if (value.length > 11) value = value.substring(0, 11);
          value = value.replace(/(\d{3})(\d)/, '$1.$2');
          value = value.replace(/(\d{3})(\d)/, '$1.$2');
          value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      }

      setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setEditFormData({ ...editFormData, [e.target.name]: e.target.value });
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Administração de Empresas</h1>
            
            <div className="flex items-center space-x-4">
                <UserMenu />

                <button 
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Nova Empresa
                </button>
            </div>
        </div>

        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CNPJ</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Representante</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {tenants.map((tenant) => (
                        <tr key={tenant.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{tenant.name}</div>
                                <div className="text-sm text-gray-500">{tenant.slug}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${tenant.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {tenant.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {tenant.cnpj}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {tenant.users[0]?.user.name || 'N/A'}
                                <br/>
                                <span className="text-xs">{tenant.users[0]?.user.email}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                <button
                                    onClick={() => handleGrantAccessDays(tenant, 30)}
                                    className="text-gray-700 hover:text-gray-900"
                                    title="Liberar 30 dias"
                                >
                                    30d
                                </button>
                                <button
                                    onClick={() => handleGrantAccessDays(tenant, 60)}
                                    className="text-gray-700 hover:text-gray-900"
                                    title="Liberar 60 dias"
                                >
                                    60d
                                </button>
                                <button
                                    onClick={() => handleGrantAccessDays(tenant, 90)}
                                    className="text-gray-700 hover:text-gray-900"
                                    title="Liberar 90 dias"
                                >
                                    90d
                                </button>
                                <button
                                    onClick={() => handleGrantAccessDays(tenant, 365)}
                                    className="text-gray-700 hover:text-gray-900"
                                    title="Liberar 1 ano"
                                >
                                    1a
                                </button>
                                <button 
                                    onClick={() => handleToggleStatus(tenant)}
                                    className={`${tenant.status === 'ACTIVE' ? 'text-green-600 hover:text-green-900' : 'text-gray-400 hover:text-gray-600'}`}
                                    title={tenant.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                                >
                                    {tenant.status === 'ACTIVE' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                                </button>
                                <button 
                                    onClick={() => handleEdit(tenant)}
                                    className="text-blue-600 hover:text-blue-900"
                                    title="Editar"
                                >
                                    <Edit2 className="w-5 h-5" />
                                </button>
                                <button 
                                    onClick={() => handleDelete(tenant.id)}
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
        </div>

        {/* Create Modal */}
        {showCreateModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                    <h2 className="text-xl font-bold mb-4">Nova Empresa</h2>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Nome da Empresa</label>
                                <input name="name" required value={formData.name} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Slug (URL)</label>
                                <input name="slug" required value={formData.slug} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">CNPJ</label>
                                <input name="cnpj" required value={formData.cnpj} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                            </div>
                        </div>

                        <div className="border-t pt-4 mt-4">
                            <h3 className="text-lg font-medium mb-2">Dados do Representante</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Nome Completo</label>
                                    <input name="representativeName" required value={formData.representativeName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Email</label>
                                    <input name="representativeEmail" type="email" required value={formData.representativeEmail} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">CPF</label>
                                    <input name="representativeCpf" required value={formData.representativeCpf} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Senha</label>
                                    <input name="representativePassword" type="password" required value={formData.representativePassword} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Whatsapp</label>
                                    <input name="representativeWhatsapp" value={formData.representativeWhatsapp} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Endereço</label>
                                    <input name="representativeAddress" value={formData.representativeAddress} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                                </div>
                            </div>
                        </div>

                        {error && <p className="text-red-500 text-sm">{error}</p>}

                        <div className="flex justify-end space-x-3 pt-4">
                            <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50">Cancelar</button>
                            <button type="submit" disabled={creating} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50">
                                {creating ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* Edit Modal */}
        {showEditModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg max-w-md w-full p-6">
                    <h2 className="text-xl font-bold mb-4">Editar Empresa</h2>
                    <form onSubmit={handleUpdate} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Nome da Empresa</label>
                            <input name="name" required value={editFormData.name} onChange={handleEditChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Slug (URL)</label>
                            <input name="slug" required value={editFormData.slug} onChange={handleEditChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">CNPJ</label>
                            <input name="cnpj" required value={editFormData.cnpj} onChange={handleEditChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Status</label>
                            <select name="status" value={editFormData.status} onChange={handleEditChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                                <option value="ACTIVE">Ativo</option>
                                <option value="INACTIVE">Inativo</option>
                            </select>
                        </div>

                        <div className="flex justify-end space-x-3 pt-4">
                            <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50">Cancelar</button>
                            <button type="submit" disabled={creating} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50">
                                {creating ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
