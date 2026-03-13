
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { Loader2, Plus, Trash2, Edit2, CheckCircle, XCircle } from 'lucide-react';
import { UserMenu } from '@/components/UserMenu';

interface Tenant {
  id: number;
  name: string;
  slug: string;
  cnpj: string;
  companyEmail?: string | null;
  status: string;
  subscriptions?: Array<{ id: number; plan: string; status: string; expiresAt: string | null }>;
  users: { user: { name: string; email: string } }[];
}

type TenantHistoryItem = {
  id: number;
  tenantId: number;
  source: string;
  message: string;
  createdAt: string;
  actorUser?: { id: number; name: string | null; email: string } | null;
  attachments?: Array<{ id: number; entryId: number; url: string | null; filename: string | null; mimeType: string | null }>;
};

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
  const inputClass = 'mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-black placeholder:text-black placeholder:opacity-50';
  const label = (text: string, required?: boolean) => (
    <label className="block text-sm font-medium text-black">
      {text}
      {required ? <span className="text-red-600"> *</span> : null}
    </label>
  );
  const UF_LIST = useRef([
    'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
  ]).current;
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [addressError, setAddressError] = useState('');
  const [coordSource, setCoordSource] = useState<'MAPS' | 'CEP' | 'MANUAL' | ''>('');
  const [addressEditedAfterMaps, setAddressEditedAfterMaps] = useState(false);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [stateSuggestions, setStateSuggestions] = useState<string[]>([]);
  const [cepCandidates, setCepCandidates] = useState<string[]>([]);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const addressSnapshotRef = useRef<{ street: string; number: string; neighborhood: string; city: string; state: string; cep: string } | null>(null);

  // Create Form State
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    cnpj: '',
    companyEmail: '',
    companyWhatsapp: '',
    link: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
    cep: '',
    latitude: '',
    longitude: '',
    representativeName: '',
    representativeEmail: '',
    representativeCpf: '',
    representativePassword: '',
    representativeWhatsapp: '',
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

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyTenant, setHistoryTenant] = useState<Tenant | null>(null);
  const [historyItems, setHistoryItems] = useState<TenantHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMessage, setHistoryMessage] = useState('');
  const [historyFiles, setHistoryFiles] = useState<FileList | null>(null);

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (!showCreateModal) return;
    const uf = String(formData.state || '').toUpperCase();
    if (uf.length !== 2 || !UF_LIST.includes(uf)) {
      setCityOptions([]);
      return;
    }
    api
      .get(`/api/geo/ibge/municipios?uf=${encodeURIComponent(uf)}`)
      .then((res) => {
        const list = Array.isArray(res.data) ? (res.data as string[]) : [];
        setCityOptions(list);
        if (formData.city.trim().length > 0 && !list.includes(formData.city.trim())) {
          setFormData((prev) => ({ ...prev, city: '' }));
          setAddressError('Cidade não pertence ao estado informado. Selecione uma cidade da lista.');
        }
      })
      .catch(() => setCityOptions([]));
  }, [UF_LIST, api, formData.city, formData.state, showCreateModal]);

  useEffect(() => {
    if (!showCreateModal) return;
    if (formData.state.trim().length > 0) {
      setStateSuggestions([]);
      return;
    }
    const q = formData.city.trim();
    if (q.length < 3) {
      setStateSuggestions([]);
      return;
    }
    const t = window.setTimeout(() => {
      api
        .get(`/api/geo/ibge/search-city?name=${encodeURIComponent(q)}`)
        .then((res) => {
          const list = Array.isArray(res.data) ? (res.data as Array<{ city: string; uf: string }>) : [];
          const ufs = Array.from(new Set(list.filter((x) => x.city.toLowerCase() === q.toLowerCase()).map((x) => x.uf)))
            .filter((x) => x.length === 2)
            .sort((a, b) => a.localeCompare(b));
          setStateSuggestions(ufs);
        })
        .catch(() => setStateSuggestions([]));
    }, 400);
    return () => window.clearTimeout(t);
  }, [api, formData.city, formData.state, showCreateModal]);

  useEffect(() => {
    if (!showCreateModal) return;
    if (coordSource !== 'MAPS') {
      setAddressEditedAfterMaps(false);
      return;
    }
    const snap = addressSnapshotRef.current;
    if (!snap) return;
    const edited =
      snap.street !== formData.street ||
      snap.number !== formData.number ||
      snap.neighborhood !== formData.neighborhood ||
      snap.city !== formData.city ||
      snap.state !== formData.state ||
      snap.cep !== formData.cep;
    setAddressEditedAfterMaps(edited);
  }, [coordSource, formData, showCreateModal]);

  const openLocation = () => {
    const lat = Number(String(formData.latitude || '').replace(',', '.'));
    const lon = Number(String(formData.longitude || '').replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setAddressError('Latitude/Longitude inválidas.');
      return;
    }
    window.open(`https://www.google.com/maps?q=${lat},${lon}`, '_blank', 'noopener,noreferrer');
  };

  const resolveByMapsLink = useCallback(async () => {
    const v = String(formData.link || '').trim();
    if (v.length < 10) {
      setAddressError('Informe um link do Google Maps.');
      return;
    }
    setAddressError('');
    setMapsLoading(true);
    try {
      const res = await api.post('/api/geo/maps/resolve', { link: v });
      const data = res.data as {
        street?: string;
        number?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        cep?: string;
        latitude?: string;
        longitude?: string;
      };
      setFormData((prev) => ({
        ...prev,
        street: data.street || prev.street,
        number: data.number || prev.number,
        neighborhood: data.neighborhood || prev.neighborhood,
        city: data.city || prev.city,
        state: data.state ? String(data.state).toUpperCase().slice(0, 2) : prev.state,
        cep: data.cep ? String(data.cep).replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2') : prev.cep,
        latitude: data.latitude || prev.latitude,
        longitude: data.longitude || prev.longitude,
      }));
      setCoordSource('MAPS');
      addressSnapshotRef.current = {
        street: data.street || formData.street,
        number: data.number || formData.number,
        neighborhood: data.neighborhood || formData.neighborhood,
        city: data.city || formData.city,
        state: data.state ? String(data.state).toUpperCase().slice(0, 2) : formData.state,
        cep: data.cep ? String(data.cep).replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2') : formData.cep,
      };
      setAddressEditedAfterMaps(false);
    } catch (err: unknown) {
      setAddressError(getApiErrorMessage(err) || 'Não foi possível buscar a localização');
    } finally {
      setMapsLoading(false);
    }
  }, [api, formData]);

  const resolveAddressByCep = useCallback(async () => {
    const clean = String(formData.cep || '').replace(/\D/g, '');
    if (clean.length !== 8) {
      setAddressError('CEP inválido. Informe 8 dígitos.');
      return;
    }
    setAddressError('');
    setCepLoading(true);
    try {
      const res = await api.post('/api/geo/cep/resolve', { cep: clean });
      const data = res.data as { street?: string; neighborhood?: string; city?: string; state?: string; cep?: string };
      setFormData((prev) => ({
        ...prev,
        street: data.street || prev.street,
        neighborhood: data.neighborhood || prev.neighborhood,
        city: data.city || prev.city,
        state: data.state ? String(data.state).toUpperCase().slice(0, 2) : prev.state,
        cep: data.cep ? String(data.cep).replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2') : prev.cep,
      }));

      if (coordSource !== 'MAPS' && (String(formData.latitude).trim().length === 0 || String(formData.longitude).trim().length === 0)) {
        const q = `${data.street || formData.street}, ${formData.number || ''}, ${data.neighborhood || formData.neighborhood}, ${data.city || formData.city} - ${data.state || formData.state}, ${data.cep || clean}`;
        const geo = await api.post('/api/geo/geocode', { query: q }).catch(() => null);
        const lat = geo?.data?.latitude ? String(geo.data.latitude) : '';
        const lon = geo?.data?.longitude ? String(geo.data.longitude) : '';
        if (lat && lon) {
          setFormData((prev) => ({ ...prev, latitude: lat, longitude: lon }));
          setCoordSource('CEP');
        }
      }
    } catch (err: unknown) {
      setAddressError(getApiErrorMessage(err) || 'Não foi possível buscar o CEP');
    } finally {
      setCepLoading(false);
    }
  }, [api, coordSource, formData]);

  const searchCepByAddress = useCallback(async () => {
    const uf = String(formData.state || '').toUpperCase();
    const c = String(formData.city || '').trim();
    const s = String(formData.street || '').trim();
    if (uf.length !== 2 || !UF_LIST.includes(uf)) {
      setAddressError('Informe um estado (UF) válido.');
      return;
    }
    if (c.length < 2 || s.length < 2) {
      setAddressError('Informe rua e cidade para buscar o CEP.');
      return;
    }
    setAddressError('');
    setCepLoading(true);
    try {
      const res = await api.get(
        `/api/geo/cep/search?uf=${encodeURIComponent(uf)}&city=${encodeURIComponent(c)}&street=${encodeURIComponent(s)}`
      );
      const list = Array.isArray(res.data) ? (res.data as string[]) : [];
      setCepCandidates(list);
      if (list.length === 1) {
        setFormData((prev) => ({ ...prev, cep: String(list[0]).replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2') }));
      } else if (list.length === 0) {
        setAddressError('CEP não encontrado para este endereço.');
      }
    } catch (err: unknown) {
      setAddressError(getApiErrorMessage(err) || 'Não foi possível buscar o CEP');
    } finally {
      setCepLoading(false);
    }
  }, [UF_LIST, api, formData.city, formData.state, formData.street]);

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

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setError('');
    setAddressError('');
    setCoordSource('');
    setAddressEditedAfterMaps(false);
    setCityOptions([]);
    setStateSuggestions([]);
    setCepCandidates([]);
    addressSnapshotRef.current = null;
  };

  const handleCreate = async (e: React.FormEvent) => {
      e.preventDefault();
      setCreating(true);
      setError('');
      try {
          await api.post('/api/admin/tenants', formData);
          closeCreateModal();
          setFormData({
            name: '', slug: '', cnpj: '',
            companyEmail: '',
            companyWhatsapp: '',
            link: '',
            street: '',
            number: '',
            neighborhood: '',
            city: '',
            state: '',
            cep: '',
            latitude: '',
            longitude: '',
            representativeName: '', representativeEmail: '', representativeCpf: '',
            representativePassword: '', representativeWhatsapp: ''
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

  const openHistory = async (tenant: Tenant) => {
    setHistoryTenant(tenant);
    setShowHistoryModal(true);
    setHistoryMessage('');
    setHistoryFiles(null);
    setHistoryLoading(true);
    try {
      const res = await api.get(`/api/admin/tenants/${tenant.id}/history`);
      setHistoryItems(res.data as TenantHistoryItem[]);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openAttachment = async (attachmentId: number) => {
    try {
      const res = await api.get(`/api/admin/tenant-history/attachments/${attachmentId}`, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(res.data);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    } catch {
      alert('Erro ao abrir anexo');
    }
  };

  const addHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!historyTenant) return;
    try {
      const msg = historyMessage.trim();
      if (msg.length === 0) {
        alert('Informe uma anotação');
        return;
      }

      if (historyFiles && historyFiles.length > 0) {
        const form = new FormData();
        form.append('message', msg);
        Array.from(historyFiles).forEach((f) => form.append('files', f));
        await api.post(`/api/admin/tenants/${historyTenant.id}/history/upload`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post(`/api/admin/tenants/${historyTenant.id}/history`, { message: msg });
      }
      const res = await api.get(`/api/admin/tenants/${historyTenant.id}/history`);
      setHistoryItems(res.data as TenantHistoryItem[]);
      setHistoryMessage('');
      setHistoryFiles(null);
    } catch {
      alert('Erro ao salvar histórico');
    }
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
      } else if (name === 'representativeWhatsapp') {
          const digits = value.replace(/\D/g, '').substring(0, 11);
          if (digits.length <= 2) {
            value = digits;
          } else {
            const ddd = digits.substring(0, 2);
            const rest = digits.substring(2);
            if (rest.length <= 4) value = `(${ddd}) ${rest}`;
            else if (rest.length <= 8) value = `(${ddd}) ${rest.substring(0, 4)}-${rest.substring(4)}`;
            else value = `(${ddd}) ${rest.substring(0, 5)}-${rest.substring(5)}`;
          }
      } else if (name === 'companyWhatsapp') {
          const digits = value.replace(/\D/g, '').substring(0, 11);
          if (digits.length <= 2) {
            value = digits;
          } else {
            const ddd = digits.substring(0, 2);
            const rest = digits.substring(2);
            if (rest.length <= 4) value = `(${ddd}) ${rest}`;
            else if (rest.length <= 8) value = `(${ddd}) ${rest.substring(0, 4)}-${rest.substring(4)}`;
            else value = `(${ddd}) ${rest.substring(0, 5)}-${rest.substring(5)}`;
          }
      } else if (name === 'cep') {
          value = value.replace(/\D/g, '').substring(0, 8);
          if (value.length > 5) value = value.replace(/^(\d{5})(\d)/, '$1-$2');
      } else if (name === 'state') {
          value = value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2);
      }

      if (name === 'latitude' || name === 'longitude') {
        setCoordSource('MANUAL');
      }

      setFormData(prev => {
        return { ...prev, [name]: value };
      });
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
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">ID</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Empresa</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Assinatura</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">CNPJ</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">E-mail</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Representante</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Ações</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {tenants.map((tenant) => (
                        <tr key={tenant.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                                {tenant.id}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{tenant.name}</div>
                                <div className="text-sm text-gray-700">{tenant.slug}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                    tenant.status === 'ACTIVE'
                                      ? 'bg-green-100 text-green-800'
                                      : tenant.status === 'TEMPORARY'
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {tenant.status === 'ACTIVE' ? 'Ativa' : tenant.status === 'TEMPORARY' ? 'Temporário' : 'Inativo'}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                {(() => {
                                  const sub = tenant.subscriptions && tenant.subscriptions.length > 0 ? tenant.subscriptions[0] : null;
                                  if (!sub) return <span className="text-sm text-gray-700">-</span>;
                                  const label = `${sub.status}${sub.plan ? ` • ${sub.plan}` : ''}`;
                                  const color =
                                    sub.status === 'ACTIVE'
                                      ? 'bg-green-100 text-green-800'
                                      : sub.status === 'TRIAL'
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : sub.status === 'PAST_DUE'
                                          ? 'bg-orange-100 text-orange-800'
                                          : 'bg-red-100 text-red-800';
                                  const expires = sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : '';
                                  return (
                                    <div className="space-y-1">
                                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${color}`}>
                                        {label}
                                      </span>
                                      {expires && <div className="text-xs text-gray-700">Expira: {expires}</div>}
                                    </div>
                                  );
                                })()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                                {tenant.cnpj}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                                {tenant.companyEmail || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                                {tenant.users[0]?.user.name || 'N/A'}
                                <br/>
                                <span className="text-xs text-gray-700">{tenant.users[0]?.user.email}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                <button
                                    onClick={() => openHistory(tenant)}
                                    className="text-gray-700 hover:text-gray-900"
                                    title="Histórico"
                                >
                                    Hist
                                </button>
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
                                    className={`${tenant.status === 'INACTIVE' ? 'text-gray-500 hover:text-gray-700' : 'text-green-600 hover:text-green-900'}`}
                                    title={tenant.status === 'INACTIVE' ? 'Ativar' : 'Desativar'}
                                >
                                    {tenant.status === 'INACTIVE' ? <XCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
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
                        <div className="text-xs text-gray-700">Campos com * são obrigatórios.</div>
                        <fieldset className="border rounded-md p-4 space-y-3">
                            <legend className="px-2 text-sm font-semibold text-black">Dados da Empresa</legend>
                            <div>
                                {label('Nome da Empresa', true)}
                                <input name="name" required value={formData.name} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    {label('Slug (URL)', true)}
                                    <input name="slug" required value={formData.slug} onChange={handleChange} className={inputClass} placeholder="minha-empresa" />
                                </div>
                                <div>
                                    {label('CNPJ', true)}
                                    <input name="cnpj" required value={formData.cnpj} onChange={handleChange} className={inputClass} placeholder="00.000.000/0000-00" />
                                </div>
                            </div>
                            <div>
                                {label('E-mail da Empresa', true)}
                                <input name="companyEmail" type="email" required value={formData.companyEmail} onChange={handleChange} className={inputClass} placeholder="contato@empresa.com.br" />
                            </div>
                            <div>
                                {label('WhatsApp / Tel da Empresa')}
                                <input name="companyWhatsapp" value={formData.companyWhatsapp} onChange={handleChange} className={inputClass} placeholder="(00) 00000-0000" />
                            </div>
                        </fieldset>

                        <fieldset className="border rounded-md p-4 space-y-3">
                            <legend className="px-2 text-sm font-semibold text-black">Endereço da Empresa</legend>
                            <div>
                                {label('Link Google Maps')}
                                <input name="link" value={formData.link} onChange={handleChange} className={inputClass} placeholder="Cole aqui o link do Google Maps" />
                                <div className="mt-2 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={resolveByMapsLink}
                                    disabled={mapsLoading || String(formData.link || '').trim().length < 10}
                                    className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
                                  >
                                    {mapsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    Buscar localização
                                  </button>
                                </div>
                                {coordSource === 'MAPS' && (
                                  <div className="mt-2 text-xs text-gray-700">Coordenadas obtidas a partir do link do Google Maps.</div>
                                )}
                                {addressEditedAfterMaps && (
                                  <div className="mt-2 text-xs text-gray-700">
                                    Você alterou o endereço após usar o link. As coordenadas podem não corresponder exatamente. Use “Buscar localização” para atualizar.
                                  </div>
                                )}
                            </div>

                            <div>
                                {label('Rua / Logradouro', true)}
                                <input name="street" required value={formData.street} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    {label('Número')}
                                    <input name="number" value={formData.number} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    {label('Bairro')}
                                    <input name="neighborhood" value={formData.neighborhood} onChange={handleChange} className={inputClass} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    {label('Cidade', true)}
                                    <input list="admin-city-options" name="city" required value={formData.city} onChange={handleChange} className={inputClass} />
                                    <datalist id="admin-city-options">
                                      {cityOptions.map((c) => (
                                        <option key={c} value={c} />
                                      ))}
                                    </datalist>
                                </div>
                                <div>
                                    {label('Estado (UF)', true)}
                                    <input list="admin-uf-options" name="state" required value={formData.state} onChange={handleChange} className={inputClass} placeholder="SP" />
                                    <datalist id="admin-uf-options">
                                      {UF_LIST.map((uf) => (
                                        <option key={uf} value={uf} />
                                      ))}
                                    </datalist>
                                    {stateSuggestions.length > 0 && (
                                      <div className="mt-2 text-xs text-gray-700">
                                        Estados com esta cidade: {stateSuggestions.join(', ')}
                                      </div>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    {label('CEP', true)}
                                    <input name="cep" required value={formData.cep} onChange={handleChange} className={inputClass} placeholder="00000-000" />
                                    {cepCandidates.length > 1 && (
                                      <select
                                        className={`${inputClass} mt-2`}
                                        value={String(formData.cep || '').replace(/\D/g, '')}
                                        onChange={(e) =>
                                          setFormData((prev) => ({
                                            ...prev,
                                            cep: String(e.target.value).replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2'),
                                          }))
                                        }
                                      >
                                        <option value="">Selecione um CEP</option>
                                        {cepCandidates.map((c) => (
                                          <option key={c} value={c}>
                                            {c.replace(/^(\d{5})(\d)/, '$1-$2')}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                </div>
                                <div className="flex flex-col justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={resolveAddressByCep}
                                    disabled={cepLoading || String(formData.cep || '').replace(/\D/g, '').length !== 8}
                                    className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2"
                                  >
                                    {cepLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    Busca Endereço por CEP
                                  </button>
                                  <button
                                    type="button"
                                    onClick={searchCepByAddress}
                                    disabled={cepLoading}
                                    className="px-4 py-2 border rounded text-black hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    Buscar CEP (por endereço)
                                  </button>
                                </div>
                            </div>
                        </fieldset>

                        <fieldset className="border rounded-md p-4 space-y-3">
                          <legend className="px-2 text-sm font-semibold text-black">Localização</legend>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              {label('Latitude')}
                              <input name="latitude" value={formData.latitude} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                              {label('Longitude')}
                              <input name="longitude" value={formData.longitude} onChange={handleChange} className={inputClass} />
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <button type="button" onClick={openLocation} className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800">
                              Localização informada
                            </button>
                          </div>
                          {coordSource === 'MAPS' && (
                            <div className="text-xs text-gray-700">Coordenadas obtidas a partir do link do Google Maps.</div>
                          )}
                          {coordSource === 'CEP' && (
                            <div className="text-xs text-gray-700">Coordenadas obtidas a partir do CEP/endereço.</div>
                          )}
                          {coordSource === 'MANUAL' && (
                            <div className="text-xs text-gray-700">Coordenadas informadas manualmente.</div>
                          )}
                        </fieldset>

                        <fieldset className="border rounded-md p-4 space-y-3">
                            <legend className="px-2 text-sm font-semibold text-black">Dados do Representante</legend>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    {label('Nome Completo', true)}
                                    <input name="representativeName" required value={formData.representativeName} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    {label('E-mail (login)', true)}
                                    <input name="representativeEmail" type="email" required value={formData.representativeEmail} onChange={handleChange} className={inputClass} placeholder="login@empresa.com.br" />
                                </div>
                                <div>
                                    {label('CPF', true)}
                                    <input name="representativeCpf" required value={formData.representativeCpf} onChange={handleChange} className={inputClass} placeholder="000.000.000-00" />
                                </div>
                                <div>
                                    {label('Senha', true)}
                                    <input name="representativePassword" type="password" required value={formData.representativePassword} onChange={handleChange} className={inputClass} />
                                </div>
                                <div>
                                    {label('WhatsApp')}
                                    <input name="representativeWhatsapp" value={formData.representativeWhatsapp} onChange={handleChange} className={inputClass} placeholder="(00) 00000-0000" />
                                </div>
                            </div>
                        </fieldset>

                        {error && <p className="text-red-500 text-sm">{error}</p>}
                        {addressError && <p className="text-red-500 text-sm">{addressError}</p>}

                        <div className="flex justify-end space-x-3 pt-4">
                            <button type="button" onClick={closeCreateModal} className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50">Cancelar</button>
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
                                <option value="ACTIVE">Ativa</option>
                                <option value="TEMPORARY">Temporário</option>
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

        {showHistoryModal && historyTenant && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Histórico - {historyTenant.name}</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowHistoryModal(false);
                    setHistoryTenant(null);
                  }}
                  className="px-3 py-1 border rounded text-gray-700 hover:bg-gray-50"
                >
                  Fechar
                </button>
              </div>

              <form onSubmit={addHistory} className="space-y-3 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Anotação</label>
                  <textarea
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 min-h-[90px]"
                    value={historyMessage}
                    onChange={(e) => setHistoryMessage(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Anexar imagens</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="mt-1 block w-full text-sm"
                    onChange={(e) => setHistoryFiles(e.target.files)}
                  />
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
                    Salvar no histórico
                  </button>
                </div>
              </form>

              {historyLoading ? (
                <div className="flex justify-center p-6">
                  <Loader2 className="animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  {historyItems.length === 0 && (
                    <div className="text-sm text-gray-700">Sem registros.</div>
                  )}
                  {historyItems.map((item) => (
                    <div key={item.id} className="border rounded p-3">
                      <div className="text-xs text-gray-700 flex justify-between">
                        <span>
                          {new Date(item.createdAt).toLocaleString()} • {item.source}
                          {item.actorUser?.email ? ` • ${item.actorUser.email}` : ''}
                        </span>
                      </div>
                      <div className="text-sm text-gray-900 mt-2 whitespace-pre-wrap">{item.message}</div>
                      {item.attachments && item.attachments.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {item.attachments.map((a) => (
                            a.url ? (
                              <a
                                key={a.id}
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-500 break-all block"
                              >
                                {a.url}
                              </a>
                            ) : (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => openAttachment(a.id)}
                                className="text-sm text-blue-600 hover:text-blue-500 break-all block text-left"
                              >
                                {a.filename || `Anexo ${a.id}`}
                              </button>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
