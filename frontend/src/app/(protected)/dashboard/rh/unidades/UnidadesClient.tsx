'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Plus, Save, Trash2 } from 'lucide-react';
import api from '@/lib/api';

type UnidadeRow = {
  id: number;
  nome: string;
  tipoUnidade: string | null;
  ativo: boolean;
};

const TIPOS = [
  { value: 'ESCRITORIO', label: 'Escritório' },
  { value: 'FILIAL', label: 'Filial' },
  { value: 'LOJA', label: 'Loja' },
  { value: 'ALMOXARIFADO', label: 'Almoxarifado' },
  { value: 'GARAGEM', label: 'Garagem' },
  { value: 'CENTRO_ADMINISTRATIVO', label: 'Centro administrativo' },
  { value: 'UNIDADE_OPERACIONAL', label: 'Unidade operacional' },
  { value: 'DEPOSITO', label: 'Depósito' },
  { value: 'OFICINA', label: 'Oficina' },
  { value: 'OUTRO_LOCAL_OPERACIONAL', label: 'Outro local operacional' },
] as const;

export default function UnidadesClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [rows, setRows] = useState<UnidadeRow[]>([]);

  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroAtivo, setFiltroAtivo] = useState<'TODOS' | 'ATIVO' | 'INATIVO'>('ATIVO');
  const [busca, setBusca] = useState('');

  const [editId, setEditId] = useState<number | null>(null);
  const [formNome, setFormNome] = useState('');
  const [formTipo, setFormTipo] = useState<string>('OUTRO_LOCAL_OPERACIONAL');
  const [formAtivo, setFormAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.nome} ${r.tipoUnidade || ''}`.toLowerCase().includes(q));
  }, [rows, busca]);

  async function carregar() {
    try {
      setLoading(true);
      setErro(null);
      const params: any = {};
      if (filtroTipo) params.tipo = filtroTipo;
      if (filtroAtivo === 'ATIVO') params.ativo = '1';
      if (filtroAtivo === 'INATIVO') params.ativo = '0';
      if (busca.trim()) params.q = busca.trim();
      const res = await api.get('/api/v1/rh/unidades', { params });
      const list = Array.isArray(res.data) ? res.data : [];
      setRows(
        list.map((r: any) => ({
          id: Number(r.id),
          nome: String(r.nome || ''),
          tipoUnidade: r.tipoUnidade ? String(r.tipoUnidade) : null,
          ativo: Boolean(r.ativo),
        }))
      );
    } catch (e: any) {
      setErro(e?.response?.data?.message || e?.message || 'Erro ao carregar unidades.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  function resetForm() {
    setEditId(null);
    setFormNome('');
    setFormTipo('OUTRO_LOCAL_OPERACIONAL');
    setFormAtivo(true);
  }

  async function salvar() {
    const nome = formNome.trim();
    if (!nome) {
      setErro('Nome obrigatório.');
      return;
    }
    try {
      setSalvando(true);
      setErro(null);
      if (editId) {
        await api.put(`/api/v1/rh/unidades/${editId}`, { nome, tipoUnidade: formTipo, ativo: formAtivo });
      } else {
        await api.post('/api/v1/rh/unidades', { nome, tipoUnidade: formTipo, ativo: formAtivo });
      }
      resetForm();
      await carregar();
    } catch (e: any) {
      setErro(e?.response?.data?.message || e?.message || 'Erro ao salvar unidade.');
    } finally {
      setSalvando(false);
    }
  }

  async function inativar(id: number) {
    if (!id) return;
    try {
      setSalvando(true);
      setErro(null);
      await api.delete(`/api/v1/rh/unidades/${id}`);
      await carregar();
    } catch (e: any) {
      setErro(e?.response?.data?.message || e?.message || 'Erro ao inativar unidade.');
    } finally {
      setSalvando(false);
    }
  }

  function editar(r: UnidadeRow) {
    setEditId(r.id);
    setFormNome(r.nome);
    setFormTipo(r.tipoUnidade || 'OUTRO_LOCAL_OPERACIONAL');
    setFormAtivo(Boolean(r.ativo));
  }

  return (
    <div className="p-6 space-y-6 text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            onClick={() => router.push('/dashboard/rh/cadastros')}
            title="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
            <Building2 size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Unidades</h1>
            <p className="text-sm text-slate-600">RH → Pessoas → Unidades</p>
          </div>
        </div>

        <button
          type="button"
          className="mt-0.5 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 inline-flex items-center gap-2"
          onClick={resetForm}
        >
          <Plus size={16} />
          Nova unidade
        </button>
      </div>

      {erro ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="text-xs text-slate-600 mb-1">Tipo</div>
            <select className="input" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <div className="text-xs text-slate-600 mb-1">Status</div>
            <select className="input" value={filtroAtivo} onChange={(e) => setFiltroAtivo(e.target.value as any)}>
              <option value="TODOS">Todos</option>
              <option value="ATIVO">Ativas</option>
              <option value="INATIVO">Inativas</option>
            </select>
          </div>
          <div className="md:col-span-5">
            <div className="text-xs text-slate-600 mb-1">Busca</div>
            <input className="input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome..." />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={carregar}>
            Aplicar filtros
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="text-sm font-semibold">{editId ? `Editar unidade #${editId}` : 'Cadastro rápido'}</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="text-xs text-slate-600 mb-1">Tipo de unidade</div>
            <select className="input" value={formTipo} onChange={(e) => setFormTipo(e.target.value)}>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-6">
            <div className="text-xs text-slate-600 mb-1">Nome</div>
            <input className="input" value={formNome} onChange={(e) => setFormNome(e.target.value)} placeholder="Ex.: Escritório Central" />
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-slate-600 mb-1">Ativo</div>
            <select className="input" value={formAtivo ? '1' : '0'} onChange={(e) => setFormAtivo(e.target.value === '1')}>
              <option value="1">Sim</option>
              <option value="0">Não</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {editId ? (
            <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={resetForm} disabled={salvando}>
              Cancelar
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 inline-flex items-center gap-2 disabled:opacity-60"
            onClick={salvar}
            disabled={salvando}
          >
            <Save size={16} />
            Salvar
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-slate-600" colSpan={4}>
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length ? (
                filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">{r.nome}</td>
                    <td className="px-3 py-2">
                      {TIPOS.find((t) => t.value === (r.tipoUnidade || ''))?.label || r.tipoUnidade || '-'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={r.ativo ? 'text-emerald-700' : 'text-slate-500'}>{r.ativo ? 'Ativa' : 'Inativa'}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => editar(r)} title="Editar">
                          <Save size={16} />
                        </button>
                        <button
                          type="button"
                          className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          onClick={() => inativar(r.id)}
                          disabled={!r.ativo || salvando}
                          title="Inativar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                    Nenhuma unidade encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

