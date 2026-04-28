'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileText, MoreVertical, Plus, ShieldCheck, TriangleAlert, User, Users } from 'lucide-react';
import { FuncionariosApi } from '@/lib/modules/funcionarios/api';
import { TerceirizadosApi } from '@/lib/modules/terceirizados/api';
import type { FuncionarioResumoDTO } from '@/lib/modules/funcionarios/types';
import type { TerceirizadoResumoDTO } from '@/lib/modules/terceirizados/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import api from '@/lib/api';

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
  cargo: string | null;
  ativo: boolean;
  statusLabel: string | null;
  tipoLocal: 'OBRA' | 'UNIDADE' | null;
  idObra: number | null;
  idUnidade: number | null;
  localNome: string | null;
  contratoId: number | null;
  contratoNumero: string | null;
  presencaPercent: number | null;
  ultimaOcorrencia: string | null;
  custoHora: number | null;
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

function fmtMoneyBRL(v: number | null) {
  if (v == null || !Number.isFinite(v)) return '-';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPercent(v: number | null) {
  if (v == null || !Number.isFinite(v)) return '-';
  const clamped = Math.max(0, Math.min(100, v));
  return `${clamped.toFixed(0)}%`;
}

function safeCsv(value: string) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function onlyDigits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function formatCpf(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (!d) return '';
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let out = p1;
  if (p2) out += `.${p2}`;
  if (p3) out += `.${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}

function currentPath() {
  try {
    if (typeof window === 'undefined') return '/dashboard/rh/cadastros';
    const p = window.location.pathname || '/dashboard/rh/cadastros';
    const s = window.location.search || '';
    return `${p}${s}`;
  } catch {
    return '/dashboard/rh/cadastros';
  }
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white text-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-700" type="button">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function CadastrosClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [obras, setObras] = useState<SelectItem[]>([]);
  const [contratos, setContratos] = useState<ContratoSelectItem[]>([]);
  const [rows, setRows] = useState<PessoaRow[]>([]);

  const [filtros, setFiltros] = useState<Filtros>({
    idObra: null,
    idContrato: null,
    tipo: 'TODOS',
    status: 'ATIVO',
    busca: '',
  });

  const [modalFuncionario, setModalFuncionario] = useState(false);
  const [modalTerceirizado, setModalTerceirizado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [formFuncionario, setFormFuncionario] = useState({
    matricula: '',
    nomeCompleto: '',
    cpf: '',
    telefoneWhatsapp: '',
    dataNascimento: '',
    rg: '',
    titulo: '',
    nomeMae: '',
    nomePai: '',
    empresaNome: '',
    idEmpresa: null as number | null,
    cargoContratual: '',
    funcaoPrincipal: '',
    tipoVinculo: 'CLT',
    dataAdmissao: '',
  });
  const [formTerceirizado, setFormTerceirizado] = useState({
    nomeCompleto: '',
    cpf: '',
    telefoneWhatsapp: '',
    dataNascimento: '',
    identidade: '',
    titulo: '',
    nomeMae: '',
    nomePai: '',
    funcao: '',
    empresaNome: '',
    idContraparteEmpresa: null as number | null,
  });
  const [empresasSugestoes, setEmpresasSugestoes] = useState<Array<{ id: number; nome: string; documento: string | null }>>([]);
  const [empresasSugestoesOpen, setEmpresasSugestoesOpen] = useState(false);
  const [empresasSugestoesLoading, setEmpresasSugestoesLoading] = useState(false);

  useEffect(() => {
    const enabled = modalTerceirizado || modalFuncionario;
    if (!enabled) return;
    const q = String((modalFuncionario ? formFuncionario.empresaNome : formTerceirizado.empresaNome) || '').trim();
    if (q.length < 2) {
      setEmpresasSugestoes([]);
      setEmpresasSugestoesLoading(false);
      return;
    }

    let cancelled = false;
    setEmpresasSugestoesLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set('q', q);
        params.set('status', 'ATIVO');
        const res = await api.get(`/api/v1/engenharia/contrapartes?${params.toString()}`);
        const payload = res.data;
        const rows = payload && typeof payload === 'object' && 'data' in payload ? (payload as any).data : payload;
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setEmpresasSugestoes(
          list
            .map((r: any) => ({ id: Number(r.idContraparte), nome: String(r.nomeRazao || ''), documento: r.documento ? String(r.documento) : null }))
            .filter((r: any) => Number.isFinite(r.id) && r.id > 0 && r.nome)
        );
      } catch {
        if (cancelled) return;
        setEmpresasSugestoes([]);
      } finally {
        if (cancelled) return;
        setEmpresasSugestoesLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [modalTerceirizado, modalFuncionario, formTerceirizado.empresaNome, formFuncionario.empresaNome]);

  async function carregarListasBase() {
    try {
      const r1 = await fetch('/api/v1/dashboard/me/filtros', { cache: 'no-store' }).then((r) => r.json().catch(() => null));
      const data = r1?.data || r1;
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
      const r2 = await fetch('/api/v1/rh/contratos-select', { cache: 'no-store' }).then((r) => r.json().catch(() => null));
      const data = r2?.data || r2;
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
        needFunc ? FuncionariosApi.listar(q, { limit: q ? 500 : 200, idObra: idObra || undefined, idContrato: idContrato || undefined }) : Promise.resolve([]),
        needTerc ? TerceirizadosApi.listar(q, { limit: q ? 500 : 200, idObra: idObra || undefined, idContrato: idContrato || undefined }) : Promise.resolve([]),
      ]);

      const mappedFunc: PessoaRow[] = (funcs as FuncionarioResumoDTO[]).map((f) => ({
        id: Number(f.id),
        tipo: 'FUNCIONARIO',
        nome: String(f.nomeCompleto || ''),
        matricula: f.matricula ? String(f.matricula) : null,
        cpf: f.cpf ? String(f.cpf) : null,
        cargo: (f.cargoContratual || f.funcaoPrincipal || null) as any,
        ativo: !!f.ativo,
        statusLabel: f.statusFuncional ? String(f.statusFuncional) : null,
        tipoLocal: (f.tipoLocal ?? null) as any,
        idObra: f.idObra ?? null,
        idUnidade: f.idUnidade ?? null,
        localNome: (f.localNome ?? null) as any,
        contratoId: f.contratoId ?? null,
        contratoNumero: (f.contratoNumero ?? null) as any,
        presencaPercent: f.presencaPercent ?? null,
        ultimaOcorrencia: null,
        custoHora: f.custoHora ?? null,
      }));

      const mappedTerc: PessoaRow[] = (tercs as TerceirizadoResumoDTO[]).map((t) => ({
        id: Number(t.id),
        tipo: 'TERCEIRIZADO',
        nome: String(t.nomeCompleto || ''),
        matricula: null,
        cpf: t.cpf ? String(t.cpf) : null,
        cargo: t.funcao ? String(t.funcao) : null,
        ativo: !!t.ativo,
        statusLabel: null,
        tipoLocal: (t.tipoLocal ?? null) as any,
        idObra: t.idObra ?? null,
        idUnidade: t.idUnidade ?? null,
        localNome: (t.localNome ?? null) as any,
        contratoId: t.contratoId ?? null,
        contratoNumero: (t.contratoNumero ?? null) as any,
        presencaPercent: null,
        ultimaOcorrencia: null,
        custoHora: null,
      }));

      let merged = [...mappedFunc, ...mappedTerc].filter((x) => Number.isFinite(x.id) && x.id > 0);

      if (filtros.status !== 'TODOS') {
        const keepActive = filtros.status === 'ATIVO';
        merged = merged.filter((x) => (keepActive ? x.ativo : !x.ativo));
      }

      merged.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

      setRows(merged);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || 'Erro ao carregar pessoas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarListasBase();
    carregar();
  }, []);

  const resumo = useMemo(() => {
    const total = rows.length;
    const ativos = rows.filter((r) => r.ativo).length;
    const presencas = rows.map((r) => r.presencaPercent).filter((v) => v != null && Number.isFinite(v)) as number[];
    const presencaMedia = presencas.length ? presencas.reduce((a, b) => a + b, 0) / presencas.length : null;

    const irregularidades = rows.filter((r) => {
      if (!r.nome.trim()) return true;
      if (r.tipo === 'FUNCIONARIO') {
        if (!String(r.matricula || '').trim()) return true;
        if (!String(r.cpf || '').trim()) return true;
        return false;
      }
      if (!String(r.cargo || '').trim()) return true;
      return false;
    }).length;

    const custos = rows.map((r) => r.custoHora).filter((v) => v != null && Number.isFinite(v)) as number[];
    const custoMedio = custos.length ? custos.reduce((a, b) => a + b, 0) / custos.length : null;

    return { total, ativos, presencaMedia, irregularidades, custoMedio };
  }, [rows]);

  function limparFiltros() {
    setFiltros({ idObra: null, idContrato: null, tipo: 'TODOS', status: 'ATIVO', busca: '' });
    setTimeout(() => carregar(), 0);
  }

  function exportarCsv() {
    const headers = ['nome', 'matricula', 'cpf', 'tipo', 'local', 'contrato', 'cargo', 'ativo'];
    const lines = [
      headers.join(','),
      ...rows.map((r) =>
        [
          safeCsv(r.nome),
          safeCsv(r.matricula || ''),
          safeCsv(r.cpf || ''),
          safeCsv(r.tipo),
          safeCsv(r.localNome || ''),
          safeCsv(r.contratoNumero || ''),
          safeCsv(r.cargo || ''),
          safeCsv(r.ativo ? 'ATIVO' : 'INATIVO'),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rh-pessoas-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportarJson() {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rh-pessoas-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function gotoPresencas() {
    router.push('/dashboard/rh/presencas');
  }

  function gotoDashboardRh() {
    router.push('/dashboard/rh/painel');
  }

  async function copiarRef(row: PessoaRow) {
    const ref = row.tipo === 'FUNCIONARIO' ? `#${row.id}` : `#T${row.id}`;
    try {
      await navigator.clipboard.writeText(ref);
    } catch {}
  }

  function abrirChecklist(row: PessoaRow) {
    const returnTo = encodeURIComponent(currentPath());
    const tipo = row.tipo === 'FUNCIONARIO' ? 'funcionario' : 'terceirizado';
    router.push(`/dashboard/rh/pessoas/${tipo}/${row.id}/checklist?returnTo=${returnTo}`);
  }

function abrirEnderecos(row: PessoaRow) {
  if (row.tipo !== 'FUNCIONARIO') return;
  const returnTo = encodeURIComponent(currentPath());
  router.push(`/dashboard/rh/pessoas/funcionario/${row.id}/enderecos?returnTo=${returnTo}`);
}

  return (
    <div className="p-6 space-y-6 text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
            <Users size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Pessoas</h1>
            <p className="text-sm text-slate-600">Gerencie funcionários e terceirizados</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-2">
            <div className="text-xs text-slate-600 mb-1">Obra</div>
            <select
              className="input"
              value={filtros.idObra ?? ''}
              onChange={(e) => setFiltros((p) => ({ ...p, idObra: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">Todas as obras</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
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

          <div className="md:col-span-2">
            <div className="text-xs text-slate-600 mb-1">Tipo</div>
            <select className="input" value={filtros.tipo} onChange={(e) => setFiltros((p) => ({ ...p, tipo: e.target.value as any }))}>
              <option value="TODOS">Todos</option>
              <option value="FUNCIONARIO">Funcionário</option>
              <option value="TERCEIRIZADO">Terceirizado</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs text-slate-600 mb-1">Status</div>
            <select className="input" value={filtros.status} onChange={(e) => setFiltros((p) => ({ ...p, status: e.target.value as any }))}>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
              <option value="TODOS">Todos</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <div className="text-xs text-slate-600 mb-1">Busca</div>
            <input
              className="input"
              placeholder="Buscar por nome, matrícula ou CPF..."
              value={filtros.busca}
              onChange={(e) => setFiltros((p) => ({ ...p, busca: e.target.value }))}
            />
          </div>

          <div className="md:col-span-1 flex items-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 w-full"
              onClick={carregar}
              disabled={loading}
            >
              Filtrar
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 inline-flex items-center gap-2"
              onClick={() => setModalFuncionario(true)}
            >
              <Plus size={16} />
              Novo funcionário
            </button>
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 inline-flex items-center gap-2"
              onClick={() => setModalTerceirizado(true)}
            >
              <Plus size={16} />
              Novo terceirizado
            </button>
            <button
              type="button"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-700"
              onClick={gotoPresencas}
            >
              Presença da obra
            </button>
            <button type="button" className="rounded-lg bg-amber-500 px-4 py-2 text-sm text-white hover:bg-amber-600" onClick={gotoDashboardRh}>
              Dashboard RH
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={limparFiltros}
            >
              Limpar filtros
            </button>
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
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Matrícula</th>
                <th className="px-3 py-2">CPF</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Obra atual</th>
                <th className="px-3 py-2">Cargo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Presença %</th>
                <th className="px-3 py-2">Última ocorrência</th>
                <th className="px-3 py-2">Custo/h</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-slate-600" colSpan={11}>
                    Carregando...
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((r) => (
                  <tr key={`${r.tipo}-${r.id}`} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-semibold">
                          {initials(r.nome)}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{r.nome}</div>
                          <div className="text-xs text-slate-500">{r.tipo === 'FUNCIONARIO' ? `#${r.id}` : `#T${r.id}`}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">{r.matricula || '-'}</td>
                    <td className="px-3 py-2">{r.cpf || '-'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={classNames(
                          'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
                          r.tipo === 'FUNCIONARIO' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        )}
                      >
                        {r.tipo === 'FUNCIONARIO' ? 'Funcionário' : 'Terceirizado'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {r.tipoLocal === 'OBRA' && r.idObra ? (
                        <button type="button" className="text-blue-700 hover:underline" onClick={() => router.push(`/dashboard/engenharia/obras/${r.idObra}`)}>
                          {r.localNome || `Obra #${r.idObra}`}
                        </button>
                      ) : (
                        <span className="text-slate-600">{r.localNome || '-'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.cargo || '-'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={classNames(
                          'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
                          r.ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                        )}
                      >
                        {r.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {r.presencaPercent == null ? (
                        <span className="text-slate-600">-</span>
                      ) : (
                        <div className="min-w-[120px]">
                          <div className="text-xs text-slate-700 mb-1">{fmtPercent(r.presencaPercent)}</div>
                          <div className="h-2 w-full rounded-full bg-slate-100">
                            <div
                              className={classNames(
                                'h-2 rounded-full',
                                (r.presencaPercent || 0) >= 90 ? 'bg-emerald-500' : (r.presencaPercent || 0) >= 75 ? 'bg-amber-500' : 'bg-red-500'
                              )}
                              style={{ width: `${Math.max(0, Math.min(100, r.presencaPercent || 0))}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.ultimaOcorrencia || '-'}</td>
                    <td className="px-3 py-2">{fmtMoneyBRL(r.custoHora)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          title="Abrir cadastro"
                          className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
                          onClick={() => (r.tipo === 'FUNCIONARIO' ? router.push(`/dashboard/rh/funcionarios?open=${r.id}`) : copiarRef(r))}
                        >
                          <User size={16} />
                        </button>
                        <button
                          type="button"
                          title="Checklist de documentos"
                          className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
                          onClick={() => abrirChecklist(r)}
                        >
                          <FileText size={16} />
                        </button>
                        <button
                          type="button"
                          title="Regras/termos (em breve)"
                          className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-400 inline-flex items-center justify-center"
                          disabled
                        >
                          <ShieldCheck size={16} />
                        </button>
                        <button
                          type="button"
                          title="Ocorrências (em breve)"
                          className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-400 inline-flex items-center justify-center"
                          disabled
                        >
                          <TriangleAlert size={16} />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              title="Mais"
                              className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
                            >
                              <MoreVertical size={16} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => copiarRef(r)}>Copiar referência</DropdownMenuItem>
                            {r.tipo === 'FUNCIONARIO' ? <DropdownMenuItem onClick={() => abrirEnderecos(r)}>Endereços</DropdownMenuItem> : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={11}>
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <Users size={18} />
            </div>
            <div>
              <div className="text-xs text-slate-600">Total de trabalhadores</div>
              <div className="text-2xl font-semibold text-slate-900">{resumo.total}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <User size={18} />
            </div>
            <div>
              <div className="text-xs text-slate-600">Ativos</div>
              <div className="text-2xl font-semibold text-slate-900">{resumo.ativos}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <ShieldCheck size={18} />
            </div>
            <div>
              <div className="text-xs text-slate-600">Presença média (mês)</div>
              <div className="text-2xl font-semibold text-slate-900">{resumo.presencaMedia == null ? '-' : `${resumo.presencaMedia.toFixed(1)}%`}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center">
              <TriangleAlert size={18} />
            </div>
            <div>
              <div className="text-xs text-slate-600">Irregularidades</div>
              <div className="text-2xl font-semibold text-slate-900">{resumo.irregularidades}</div>
              <div className="text-xs text-slate-500">Campos mínimos</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center">
              <Download size={18} />
            </div>
            <div>
              <div className="text-xs text-slate-600">Custo médio / hora</div>
              <div className="text-2xl font-semibold text-slate-900">{resumo.custoMedio == null ? '-' : fmtMoneyBRL(resumo.custoMedio)}</div>
              <div className="text-xs text-slate-500">Período atual</div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={modalFuncionario}
        title="Novo funcionário"
        onClose={() => {
          if (!salvando) setModalFuncionario(false);
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs text-slate-600 mb-1">Matrícula</div>
              <input
                className="input"
                placeholder="Gerada automaticamente se ficar em branco"
                value={formFuncionario.matricula}
                onChange={(e) => setFormFuncionario((p) => ({ ...p, matricula: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">CPF</div>
              <input
                className="input"
                placeholder="000.000.000-00"
                value={formFuncionario.cpf}
                onChange={(e) => setFormFuncionario((p) => ({ ...p, cpf: e.target.value }))}
                onBlur={() => setFormFuncionario((p) => ({ ...p, cpf: formatCpf(p.cpf) }))}
              />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-slate-600 mb-1">Nome completo</div>
              <input className="input" value={formFuncionario.nomeCompleto} onChange={(e) => setFormFuncionario((p) => ({ ...p, nomeCompleto: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-slate-600 mb-1">Empresa (contraparte) (opcional)</div>
              <div className="relative">
                <input
                  className="input"
                  value={formFuncionario.empresaNome}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormFuncionario((p) => ({ ...p, empresaNome: v, idEmpresa: null }));
                    setEmpresasSugestoesOpen(true);
                  }}
                  onFocus={() => setEmpresasSugestoesOpen(true)}
                  onBlur={() => window.setTimeout(() => setEmpresasSugestoesOpen(false), 150)}
                  placeholder="Digite nome ou CNPJ/CPF"
                />
                {empresasSugestoesOpen ? (
                  <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                    {empresasSugestoesLoading ? (
                      <div className="px-3 py-2 text-sm text-slate-600">Buscando…</div>
                    ) : empresasSugestoes.length ? (
                      <div className="max-h-64 overflow-auto">
                        {empresasSugestoes.slice(0, 30).map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => {
                              setFormFuncionario((p) => ({ ...p, empresaNome: r.nome, idEmpresa: r.id }));
                              setEmpresasSugestoesOpen(false);
                            }}
                          >
                            <div className="font-semibold text-slate-900">{r.nome}</div>
                            <div className="text-xs text-slate-600">{r.documento ? r.documento : '-'}</div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-2 text-sm text-slate-600">Nenhuma empresa encontrada.</div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Telefone / WhatsApp</div>
              <input
                className="input"
                placeholder="(00) 00000-0000"
                value={formFuncionario.telefoneWhatsapp}
                onChange={(e) => setFormFuncionario((p) => ({ ...p, telefoneWhatsapp: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Data de nascimento</div>
              <input className="input" type="date" value={formFuncionario.dataNascimento} onChange={(e) => setFormFuncionario((p) => ({ ...p, dataNascimento: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Identidade (RG)</div>
              <input className="input" value={formFuncionario.rg} onChange={(e) => setFormFuncionario((p) => ({ ...p, rg: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Título</div>
              <input className="input" value={formFuncionario.titulo} onChange={(e) => setFormFuncionario((p) => ({ ...p, titulo: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Nome da mãe</div>
              <input className="input" value={formFuncionario.nomeMae} onChange={(e) => setFormFuncionario((p) => ({ ...p, nomeMae: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Nome do pai</div>
              <input className="input" value={formFuncionario.nomePai} onChange={(e) => setFormFuncionario((p) => ({ ...p, nomePai: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Cargo</div>
              <input className="input" value={formFuncionario.cargoContratual} onChange={(e) => setFormFuncionario((p) => ({ ...p, cargoContratual: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Função</div>
              <input className="input" value={formFuncionario.funcaoPrincipal} onChange={(e) => setFormFuncionario((p) => ({ ...p, funcaoPrincipal: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Tipo de vínculo</div>
              <select className="input" value={formFuncionario.tipoVinculo} onChange={(e) => setFormFuncionario((p) => ({ ...p, tipoVinculo: e.target.value }))}>
                <option value="CLT">CLT</option>
                <option value="PJ">PJ</option>
                <option value="ESTAGIO">Estágio</option>
                <option value="TEMPORARIO">Temporário</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Data de admissão</div>
              <input className="input" type="date" value={formFuncionario.dataAdmissao} onChange={(e) => setFormFuncionario((p) => ({ ...p, dataAdmissao: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
              disabled={salvando}
              onClick={() => setModalFuncionario(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              disabled={salvando}
              onClick={async () => {
                try {
                  setSalvando(true);
                  const cpfDigits = onlyDigits(formFuncionario.cpf || '');
                  if (cpfDigits.length !== 11) throw new Error('CPF inválido: deve ter 11 dígitos.');
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(formFuncionario.dataNascimento || '').slice(0, 10))) {
                    throw new Error('Data de nascimento inválida.');
                  }
                  await FuncionariosApi.criar({
                    matricula: String(formFuncionario.matricula || '').trim() ? String(formFuncionario.matricula || '').trim() : null,
                    nomeCompleto: formFuncionario.nomeCompleto,
                    cpf: cpfDigits,
                    idEmpresa: typeof formFuncionario.idEmpresa === 'number' ? formFuncionario.idEmpresa : null,
                    telefoneWhatsapp: String(formFuncionario.telefoneWhatsapp || '').trim() ? String(formFuncionario.telefoneWhatsapp || '').trim() : null,
                    dataNascimento: String(formFuncionario.dataNascimento || '').slice(0, 10),
                    rg: String(formFuncionario.rg || '').trim() ? String(formFuncionario.rg || '').trim() : null,
                    titulo: String(formFuncionario.titulo || '').trim() ? String(formFuncionario.titulo || '').trim() : null,
                    nomeMae: String(formFuncionario.nomeMae || '').trim() ? String(formFuncionario.nomeMae || '').trim() : null,
                    nomePai: String(formFuncionario.nomePai || '').trim() ? String(formFuncionario.nomePai || '').trim() : null,
                    cargoContratual: String(formFuncionario.cargoContratual || '').trim() ? String(formFuncionario.cargoContratual || '').trim() : null,
                    funcaoPrincipal: String(formFuncionario.funcaoPrincipal || '').trim() ? String(formFuncionario.funcaoPrincipal || '').trim() : null,
                    tipoVinculo: String(formFuncionario.tipoVinculo || '').trim() ? String(formFuncionario.tipoVinculo || '').trim() : null,
                    dataAdmissao: String(formFuncionario.dataAdmissao || '').slice(0, 10) ? String(formFuncionario.dataAdmissao || '').slice(0, 10) : null,
                    ativo: true,
                  } as any);
                  setFormFuncionario({
                    matricula: '',
                    nomeCompleto: '',
                    cpf: '',
                    telefoneWhatsapp: '',
                    dataNascimento: '',
                    rg: '',
                    titulo: '',
                    nomeMae: '',
                    nomePai: '',
                    empresaNome: '',
                    idEmpresa: null,
                    cargoContratual: '',
                    funcaoPrincipal: '',
                    tipoVinculo: 'CLT',
                    dataAdmissao: '',
                  });
                  setModalFuncionario(false);
                  await carregar();
                } catch (e: any) {
                  setError(e?.message || 'Erro ao criar funcionário');
                } finally {
                  setSalvando(false);
                }
              }}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={modalTerceirizado}
        title="Novo terceirizado"
        onClose={() => {
          if (!salvando) setModalTerceirizado(false);
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="text-xs text-slate-600 mb-1">Nome completo</div>
              <input className="input" value={formTerceirizado.nomeCompleto} onChange={(e) => setFormTerceirizado((p) => ({ ...p, nomeCompleto: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">CPF</div>
              <input
                className="input"
                placeholder="000.000.000-00"
                value={formTerceirizado.cpf}
                onChange={(e) => setFormTerceirizado((p) => ({ ...p, cpf: e.target.value }))}
                onBlur={() => setFormTerceirizado((p) => ({ ...p, cpf: formatCpf(p.cpf) }))}
              />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Telefone / WhatsApp</div>
              <input
                className="input"
                placeholder="(00) 00000-0000"
                value={formTerceirizado.telefoneWhatsapp}
                onChange={(e) => setFormTerceirizado((p) => ({ ...p, telefoneWhatsapp: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Data de nascimento</div>
              <input className="input" type="date" value={formTerceirizado.dataNascimento} onChange={(e) => setFormTerceirizado((p) => ({ ...p, dataNascimento: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Identidade</div>
              <input className="input" value={formTerceirizado.identidade} onChange={(e) => setFormTerceirizado((p) => ({ ...p, identidade: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Título</div>
              <input className="input" value={formTerceirizado.titulo} onChange={(e) => setFormTerceirizado((p) => ({ ...p, titulo: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Nome da mãe</div>
              <input className="input" value={formTerceirizado.nomeMae} onChange={(e) => setFormTerceirizado((p) => ({ ...p, nomeMae: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Nome do pai</div>
              <input className="input" value={formTerceirizado.nomePai} onChange={(e) => setFormTerceirizado((p) => ({ ...p, nomePai: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-slate-600 mb-1">Empresa (contraparte)</div>
              <div className="relative">
                <input
                  className="input"
                  value={formTerceirizado.empresaNome}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormTerceirizado((p) => ({ ...p, empresaNome: v, idContraparteEmpresa: null }));
                    setEmpresasSugestoesOpen(true);
                  }}
                  onFocus={() => setEmpresasSugestoesOpen(true)}
                  onBlur={() => window.setTimeout(() => setEmpresasSugestoesOpen(false), 150)}
                  placeholder="Digite nome ou CNPJ/CPF"
                />
                {empresasSugestoesOpen ? (
                  <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                    {empresasSugestoesLoading ? (
                      <div className="px-3 py-2 text-sm text-slate-600">Buscando…</div>
                    ) : empresasSugestoes.length ? (
                      <div className="max-h-64 overflow-auto">
                        {empresasSugestoes.slice(0, 30).map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setFormTerceirizado((p) => ({ ...p, empresaNome: r.nome, idContraparteEmpresa: r.id }));
                              setEmpresasSugestoesOpen(false);
                            }}
                          >
                            <div className="font-semibold text-slate-900">{r.nome}</div>
                            <div className="text-xs text-slate-600">{r.documento ? r.documento : '-'}</div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-2 text-sm text-slate-600">Nenhuma empresa encontrada.</div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-slate-600 mb-1">Função</div>
              <input className="input" value={formTerceirizado.funcao} onChange={(e) => setFormTerceirizado((p) => ({ ...p, funcao: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
              disabled={salvando}
              onClick={() => setModalTerceirizado(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              disabled={salvando}
              onClick={async () => {
                try {
                  setSalvando(true);
                  const cpfDigits = onlyDigits(formTerceirizado.cpf || '');
                  if (cpfDigits.length !== 11) throw new Error('CPF inválido: deve ter 11 dígitos.');
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(formTerceirizado.dataNascimento || '').slice(0, 10))) {
                    throw new Error('Data de nascimento inválida.');
                  }
                  await TerceirizadosApi.criar({
                    nomeCompleto: formTerceirizado.nomeCompleto,
                    cpf: cpfDigits,
                    dataNascimento: String(formTerceirizado.dataNascimento || '').slice(0, 10),
                    funcao: formTerceirizado.funcao || null,
                    telefoneWhatsapp: String(formTerceirizado.telefoneWhatsapp || '').trim() ? String(formTerceirizado.telefoneWhatsapp || '').trim() : null,
                    identidade: String(formTerceirizado.identidade || '').trim() ? String(formTerceirizado.identidade || '').trim() : null,
                    titulo: String(formTerceirizado.titulo || '').trim() ? String(formTerceirizado.titulo || '').trim() : null,
                    nomeMae: String(formTerceirizado.nomeMae || '').trim() ? String(formTerceirizado.nomeMae || '').trim() : null,
                    nomePai: String(formTerceirizado.nomePai || '').trim() ? String(formTerceirizado.nomePai || '').trim() : null,
                    idContraparteEmpresa: typeof formTerceirizado.idContraparteEmpresa === 'number' ? formTerceirizado.idContraparteEmpresa : null,
                    ativo: true,
                  } as any);
                  setFormTerceirizado({
                    nomeCompleto: '',
                    cpf: '',
                    telefoneWhatsapp: '',
                    dataNascimento: '',
                    identidade: '',
                    titulo: '',
                    nomeMae: '',
                    nomePai: '',
                    funcao: '',
                    empresaNome: '',
                    idContraparteEmpresa: null,
                  });
                  setModalTerceirizado(false);
                  await carregar();
                } catch (e: any) {
                  setError(e?.message || 'Erro ao criar terceirizado');
                } finally {
                  setSalvando(false);
                }
              }}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
