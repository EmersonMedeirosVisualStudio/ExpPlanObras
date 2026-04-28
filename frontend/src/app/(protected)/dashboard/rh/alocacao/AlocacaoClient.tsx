'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, Plus, Users } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import api from '@/lib/api';
import { FuncionariosApi } from '@/lib/modules/funcionarios/api';
import type { FuncionarioResumoDTO } from '@/lib/modules/funcionarios/types';
import { TerceirizadosApi } from '@/lib/modules/terceirizados/api';
import type { TerceirizadoResumoDTO } from '@/lib/modules/terceirizados/types';

type TipoPessoa = 'FUNCIONARIO' | 'TERCEIRIZADO';
type StatusFiltro = 'TODOS' | 'ATIVO' | 'INATIVO';

type Filtros = {
  idObra: number | null;
  idContrato: number | null;
  tipo: TipoPessoa | 'TODOS';
  status: StatusFiltro;
  busca: string;
};

type PessoaRow = {
  id: number;
  tipo: TipoPessoa;
  nome: string;
  matricula: string | null;
  cpf: string | null;
  funcao: string | null;
  ativo: boolean;
  tipoLocal: 'OBRA' | 'UNIDADE' | null;
  idObra: number | null;
  idUnidade: number | null;
  localNome: string | null;
  contratoId: number | null;
  contratoNumero: string | null;
  empresaParceira: string | null;
};

type SelectItem = { id: number; nome: string };
type ContratoSelectItem = { id: number; numeroContrato: string | null };

function classNames(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(' ');
}

function initials(nome: string) {
  const p = String(nome || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!p.length) return '?';
  const a = p[0]?.[0] || '';
  const b = p.length > 1 ? p[p.length - 1]?.[0] || '' : '';
  return (a + b).toUpperCase();
}

function safeCsv(v: unknown) {
  const s = String(v ?? '');
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function AlocacaoClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const returnTo = searchParams.get('returnTo') || '';
  const backHref = returnTo || '/dashboard/rh/cadastros';

  const [obras, setObras] = useState<SelectItem[]>([]);
  const [contratos, setContratos] = useState<ContratoSelectItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filtros, setFiltros] = useState<Filtros>({
    idObra: null,
    idContrato: null,
    tipo: 'TODOS',
    status: 'ATIVO',
    busca: '',
  });

  const [rows, setRows] = useState<PessoaRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [dataInicio, setDataInicio] = useState(todayISO());
  const [observacao, setObservacao] = useState('');
  const [alocando, setAlocando] = useState(false);

  function currentPath() {
    const qs = searchParams.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  async function carregarListasBase() {
    try {
      const res = await api.get('/api/v1/dashboard/me/filtros');
      const payload = res.data;
      if (!payload || typeof payload !== 'object' || !('success' in payload) || !(payload as any).success) {
        throw new Error((payload as any)?.message || 'Erro ao carregar filtros');
      }
      const data = (payload as any).data;
      const obrasRaw = Array.isArray(data?.obras) ? data.obras : [];
      setObras(
        obrasRaw
          .map((o: any) => ({ id: Number(o.id), nome: String(o.nome || '') }))
          .filter((o: any) => Number.isFinite(o.id) && o.id > 0)
      );
    } catch {
      setObras([]);
    }

    try {
      const res = await api.get('/api/v1/rh/contratos-select');
      const payload = res.data;
      if (!payload || typeof payload !== 'object' || !('success' in payload) || !(payload as any).success) {
        throw new Error((payload as any)?.message || 'Erro ao carregar contratos');
      }
      const data = (payload as any).data;
      const list = Array.isArray(data) ? data : [];
      setContratos(
        list
          .map((c: any) => ({ id: Number(c.id), numeroContrato: c.numeroContrato == null ? null : String(c.numeroContrato) }))
          .filter((c: any) => Number.isFinite(c.id) && c.id > 0)
      );
    } catch {
      setContratos([]);
    }
  }

  async function carregar() {
    const q = filtros.busca.trim();
    const idObra = filtros.idObra;
    const idContrato = filtros.idContrato;

    try {
      setLoading(true);
      setError(null);

      const needFunc = filtros.tipo === 'TODOS' || filtros.tipo === 'FUNCIONARIO';
      const needTerc = filtros.tipo === 'TODOS' || filtros.tipo === 'TERCEIRIZADO';

      const [funcs, tercs] = await Promise.all([
        needFunc ? FuncionariosApi.listar(q, { limit: q ? 600 : 250, idObra: idObra || undefined, idContrato: idContrato || undefined }) : Promise.resolve([]),
        needTerc ? TerceirizadosApi.listar(q, { limit: q ? 600 : 250, idObra: idObra || undefined, idContrato: idContrato || undefined }) : Promise.resolve([]),
      ]);

      const mappedFunc: PessoaRow[] = (funcs as FuncionarioResumoDTO[]).map((f) => ({
        id: Number(f.id),
        tipo: 'FUNCIONARIO',
        nome: String(f.nomeCompleto || ''),
        matricula: f.matricula ? String(f.matricula) : null,
        cpf: f.cpf ? String(f.cpf) : null,
        funcao: (f.cargoContratual || f.funcaoPrincipal || null) as any,
        ativo: !!f.ativo,
        tipoLocal: (f.tipoLocal ?? null) as any,
        idObra: f.idObra ?? null,
        idUnidade: f.idUnidade ?? null,
        localNome: (f.localNome ?? null) as any,
        contratoId: f.contratoId ?? null,
        contratoNumero: (f.contratoNumero ?? null) as any,
        empresaParceira: null,
      }));

      const mappedTerc: PessoaRow[] = (tercs as TerceirizadoResumoDTO[]).map((t) => ({
        id: Number(t.id),
        tipo: 'TERCEIRIZADO',
        nome: String(t.nomeCompleto || ''),
        matricula: null,
        cpf: t.cpf ? String(t.cpf) : null,
        funcao: t.funcao ? String(t.funcao) : null,
        ativo: !!t.ativo,
        tipoLocal: (t.tipoLocal ?? null) as any,
        idObra: t.idObra ?? null,
        idUnidade: t.idUnidade ?? null,
        localNome: (t.localNome ?? null) as any,
        contratoId: t.contratoId ?? null,
        contratoNumero: (t.contratoNumero ?? null) as any,
        empresaParceira: t.empresaParceira ? String(t.empresaParceira) : null,
      }));

      let merged = [...mappedFunc, ...mappedTerc].filter((x) => Number.isFinite(x.id) && x.id > 0);
      if (filtros.status !== 'TODOS') {
        const keepActive = filtros.status === 'ATIVO';
        merged = merged.filter((x) => (keepActive ? x.ativo : !x.ativo));
      }

      merged.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      setRows(merged);
      setSelectedKeys(new Set());
    } catch (e: any) {
      setRows([]);
      setSelectedKeys(new Set());
      setError(e?.message || 'Erro ao carregar alocação');
    } finally {
      setLoading(false);
    }
  }

  const autoReadyRef = useRef(false);
  useEffect(() => {
    if (!autoReadyRef.current) return;
    carregar();
  }, [filtros.tipo, filtros.status, filtros.idObra, filtros.idContrato]);

  useEffect(() => {
    if (!autoReadyRef.current) return;
    const t = window.setTimeout(() => carregar(), 350);
    return () => window.clearTimeout(t);
  }, [filtros.busca]);

  useEffect(() => {
    carregarListasBase();
    carregar();
    autoReadyRef.current = true;
  }, []);

  const alocados = useMemo(() => {
    if (!filtros.idObra) return [];
    return rows.filter((r) => r.tipoLocal === 'OBRA' && r.idObra === filtros.idObra);
  }, [rows, filtros.idObra]);

  const disponiveis = useMemo(() => {
    if (!filtros.idObra) return rows;
    return rows.filter((r) => !(r.tipoLocal === 'OBRA' && r.idObra === filtros.idObra));
  }, [rows, filtros.idObra]);

  const resumo = useMemo(() => {
    const total = rows.length;
    const ativos = rows.filter((r) => r.ativo).length;
    const alocadosTotal = alocados.length;
    const funcionariosAlocados = alocados.filter((r) => r.tipo === 'FUNCIONARIO').length;
    const terceirizadosAlocados = alocados.filter((r) => r.tipo === 'TERCEIRIZADO').length;
    return { total, ativos, alocadosTotal, funcionariosAlocados, terceirizadosAlocados };
  }, [rows, alocados]);

  function toggleSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function abrirFicha(row: PessoaRow) {
    const tipo = row.tipo === 'FUNCIONARIO' ? 'funcionario' : 'terceirizado';
    router.push(`/dashboard/rh/pessoas/${tipo}/${row.id}?returnTo=${encodeURIComponent(currentPath())}`);
  }

  async function alocarSelecionados() {
    if (!filtros.idObra) {
      setError('Selecione uma obra para alocar.');
      return;
    }
    const keys = Array.from(selectedKeys);
    const funcionarios = keys
      .filter((k) => k.startsWith('FUNCIONARIO-'))
      .map((k) => Number(k.replace('FUNCIONARIO-', '')))
      .filter((id) => Number.isFinite(id) && id > 0);
    const terceirizados = keys
      .filter((k) => k.startsWith('TERCEIRIZADO-'))
      .map((k) => Number(k.replace('TERCEIRIZADO-', '')))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!funcionarios.length && !terceirizados.length) return;

    try {
      setAlocando(true);
      setError(null);
      const obs = observacao.trim() ? observacao.trim() : null;
      await Promise.all([
        ...funcionarios.map((idFuncionario) =>
          FuncionariosApi.adicionarLotacao(idFuncionario, {
            tipoLotacao: 'OBRA',
            idObra: filtros.idObra as number,
            idUnidade: null as any,
            dataInicio,
            observacao: obs,
          } as any)
        ),
        ...terceirizados.map((idTerceirizado) =>
          TerceirizadosApi.adicionarAlocacao(idTerceirizado, {
            tipoLocal: 'OBRA',
            idObra: filtros.idObra as number,
            idUnidade: null,
            dataInicio,
            observacao: obs,
          })
        ),
      ]);
      setSelectedKeys(new Set());
      await carregar();
    } catch (e: any) {
      setError(e?.message || 'Erro ao alocar');
    } finally {
      setAlocando(false);
    }
  }

  function exportarCsv() {
    const headers = ['nome', 'tipo', 'cpf', 'matricula', 'funcao', 'obra', 'contrato', 'ativo', 'empresaParceira'];
    const lines = [
      headers.join(','),
      ...alocados.map((r) =>
        [
          safeCsv(r.nome),
          safeCsv(r.tipo),
          safeCsv(r.cpf || ''),
          safeCsv(r.matricula || ''),
          safeCsv(r.funcao || ''),
          safeCsv(r.localNome || ''),
          safeCsv(r.contratoNumero || ''),
          safeCsv(r.ativo ? 'ATIVO' : 'INATIVO'),
          safeCsv(r.empresaParceira || ''),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rh-alocacao-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportarJson() {
    const blob = new Blob([JSON.stringify(alocados, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rh-alocacao-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const obraLabel = useMemo(() => {
    if (!filtros.idObra) return 'Selecione uma obra';
    const found = obras.find((o) => o.id === filtros.idObra);
    return found?.nome || `Obra #${filtros.idObra}`;
  }, [filtros.idObra, obras]);

  return (
    <div className="p-6 space-y-6 text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            onClick={() => router.push(backHref)}
            title="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
            <Users size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Alocação de equipe</h1>
            <p className="text-sm text-slate-600">RH → Alocação de equipe</p>
          </div>
        </div>

        <div className="mt-0.5 flex gap-2 flex-wrap justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2">
                <Download size={16} />
                Exportar
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportarCsv}>CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={exportarJson}>JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <div className="text-xs text-slate-600 mb-1">Obra</div>
            <select
              className="input"
              value={filtros.idObra ?? ''}
              onChange={(e) => setFiltros((p) => ({ ...p, idObra: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">Selecione uma obra</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <div className="text-xs text-slate-600 mb-1">Contrato</div>
            <select
              className="input"
              value={filtros.idContrato ?? ''}
              onChange={(e) => setFiltros((p) => ({ ...p, idContrato: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">Todos os contratos</option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numeroContrato ? c.numeroContrato : `Contrato #${c.id}`}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-6">
            <div className="text-xs text-slate-600 mb-1">Busca</div>
            <input
              className="input"
              placeholder="Buscar por nome, matrícula ou CPF..."
              value={filtros.busca}
              onChange={(e) => setFiltros((p) => ({ ...p, busca: e.target.value }))}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg bg-slate-50 p-1">
            <button
              type="button"
              className={classNames('rounded-md px-3 py-1.5 text-sm', filtros.tipo === 'TODOS' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:bg-white/60')}
              onClick={() => setFiltros((p) => ({ ...p, tipo: 'TODOS' }))}
            >
              Todos
            </button>
            <button
              type="button"
              className={classNames(
                'rounded-md px-3 py-1.5 text-sm',
                filtros.tipo === 'FUNCIONARIO' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:bg-white/60'
              )}
              onClick={() => setFiltros((p) => ({ ...p, tipo: 'FUNCIONARIO' }))}
            >
              Funcionários
            </button>
            <button
              type="button"
              className={classNames(
                'rounded-md px-3 py-1.5 text-sm',
                filtros.tipo === 'TERCEIRIZADO' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:bg-white/60'
              )}
              onClick={() => setFiltros((p) => ({ ...p, tipo: 'TERCEIRIZADO' }))}
            >
              Terceirizados
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-50 p-1">
            <button
              type="button"
              className={classNames('rounded-md px-3 py-1.5 text-sm', filtros.status === 'TODOS' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:bg-white/60')}
              onClick={() => setFiltros((p) => ({ ...p, status: 'TODOS' }))}
            >
              Todos
            </button>
            <button
              type="button"
              className={classNames('rounded-md px-3 py-1.5 text-sm', filtros.status === 'ATIVO' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:bg-white/60')}
              onClick={() => setFiltros((p) => ({ ...p, status: 'ATIVO' }))}
            >
              Ativo
            </button>
            <button
              type="button"
              className={classNames('rounded-md px-3 py-1.5 text-sm', filtros.status === 'INATIVO' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:bg-white/60')}
              onClick={() => setFiltros((p) => ({ ...p, status: 'INATIVO' }))}
            >
              Inativo
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Disponíveis</div>
                <div className="text-xs text-slate-600">{loading ? 'Carregando...' : `${disponiveis.length} pessoas`}</div>
              </div>
              <div className="text-xs text-slate-600">{obraLabel}</div>
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 gap-2">
              <div>
                <div className="text-xs text-slate-600 mb-1">Data de início</div>
                <input className="input" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div>
                <div className="text-xs text-slate-600 mb-1">Observação</div>
                <input className="input" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" />
              </div>
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 inline-flex items-center justify-center gap-2 disabled:opacity-60"
                disabled={alocando || !selectedKeys.size || !filtros.idObra}
                onClick={alocarSelecionados}
              >
                <Plus size={16} />
                Alocar selecionados
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 max-h-[520px] overflow-auto">
            {loading ? (
              <div className="p-4 text-sm text-slate-600">Carregando...</div>
            ) : (
              <div className="divide-y">
                {disponiveis.map((r) => {
                  const key = `${r.tipo}-${r.id}`;
                  const checked = selectedKeys.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={classNames(
                        'w-full text-left p-3 hover:bg-slate-50 flex items-center gap-3',
                        checked ? 'bg-indigo-50' : ''
                      )}
                      onClick={() => toggleSelected(key)}
                    >
                      <div
                        className={classNames(
                          'h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold',
                          r.tipo === 'FUNCIONARIO' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                        )}
                      >
                        {initials(r.nome)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-900">{r.nome}</div>
                        <div className="truncate text-xs text-slate-600">
                          {r.tipo === 'FUNCIONARIO' ? `Funcionário${r.matricula ? ` • ${r.matricula}` : ''}` : `Terceirizado${r.empresaParceira ? ` • ${r.empresaParceira}` : ''}`}
                        </div>
                      </div>
                      <input type="checkbox" checked={checked} readOnly className="h-4 w-4" />
                    </button>
                  );
                })}
                {!disponiveis.length ? <div className="p-4 text-sm text-slate-600">Nenhuma pessoa encontrada.</div> : null}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-slate-900">Alocados na obra</div>
                <div className="text-xs text-slate-600">
                  {resumo.alocadosTotal} total • {resumo.funcionariosAlocados} funcionários • {resumo.terceirizadosAlocados} terceirizados
                </div>
              </div>
              <div className="text-xs text-slate-600">
                {resumo.ativos} ativos • {resumo.total} listados
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Função</th>
                  <th className="px-3 py-2">Contrato</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-6 text-slate-600" colSpan={6}>
                      Carregando...
                    </td>
                  </tr>
                ) : alocados.length ? (
                  alocados.map((r) => (
                    <tr key={`${r.tipo}-${r.id}`} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{r.nome}</div>
                        <div className="text-xs text-slate-600">{r.localNome || '-'}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={classNames('rounded-full px-2 py-0.5 text-xs', r.tipo === 'FUNCIONARIO' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700')}>
                          {r.tipo === 'FUNCIONARIO' ? 'Funcionário' : 'Terceirizado'}
                        </span>
                      </td>
                      <td className="px-3 py-2">{r.funcao || '-'}</td>
                      <td className="px-3 py-2">{r.contratoNumero || '-'}</td>
                      <td className="px-3 py-2">
                        <span className={classNames('rounded-full px-2 py-0.5 text-xs', r.ativo ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600')}>
                          {r.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => abrirFicha(r)}
                        >
                          Abrir ficha
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-6 text-slate-600" colSpan={6}>
                      {filtros.idObra ? 'Nenhuma pessoa alocada nesta obra.' : 'Selecione uma obra para ver alocados.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
