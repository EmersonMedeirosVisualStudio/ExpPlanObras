'use client';

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Building2, CheckCircle, Download, FileText, IdCard, MoreVertical, Plus, ShieldCheck, TriangleAlert, User, Users, XCircle } from 'lucide-react';
import { FuncionariosApi } from '@/lib/modules/funcionarios/api';
import { TerceirizadosApi } from '@/lib/modules/terceirizados/api';
import { OrganogramaApi } from '@/lib/modules/organograma/api';
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

type ChecklistAlertaNivel = 'OK' | 'PENDENTE' | 'PENDENTE_OBRIG' | 'A_VENCER' | 'VENCIDO' | 'SEM_VINCULO';
type ChecklistAlertaDTO = {
  pessoaId: number;
  tipoVinculo: TipoPessoa;
  nivel: ChecklistAlertaNivel;
  tooltip: string;
  resumo: { total: number; ok: number; pendente: number; vencido: number; aVencer: number; obrigatoriosPendentes: number };
};

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

function formatCnpjCpf(value: string | null) {
  const d = onlyDigits(value || '');
  if (!d) return null;
  if (d.length === 11) return formatCpf(d);
  if (d.length !== 14) return value;
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 8);
  const p4 = d.slice(8, 12);
  const p5 = d.slice(12, 14);
  return `${p1}.${p2}.${p3}/${p4}-${p5}`;
}

function formatPhoneBr(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
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

function safeInternalPath(path: string | null) {
  const raw = String(path || '').trim();
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  if (raw.includes('://')) return null;
  return raw;
}

function parseInternalPath(path: string | null) {
  const safe = safeInternalPath(path);
  if (!safe) return null;
  try {
    const u = new URL(safe, 'https://internal.local');
    return { pathname: u.pathname, searchParams: u.searchParams };
  } catch {
    return null;
  }
}

function breadcrumbFromReturnTo(returnTo: string | null, extra?: { obraNome?: string | null; obras?: Array<{ id: number; nome: string }> }) {
  const parsed = parseInternalPath(returnTo);
  const suffix = 'RH → Pessoas';
  if (!parsed?.pathname) return suffix;

  const parts = parsed.pathname.split('/').filter(Boolean);
  const segs = parts[0] === 'dashboard' ? parts.slice(1) : parts;
  const labels: string[] = [];

  const map: Record<string, string> = {
    engenharia: 'Engenharia',
    obras: 'Obras',
    projetos: 'Projetos',
    fiscalizacao: 'Fiscalização',
    diario: 'Diário',
    medicoes: 'Medições',
    rh: 'RH',
    presencas: 'Presenças',
    painel: 'Painel',
    cadastros: 'Pessoas',
    pessoas: 'Pessoas',
  };

  for (let i = 0; i < segs.length; i++) {
    const seg = String(segs[i] || '');
    const lower = seg.toLowerCase();
    const prev = String(segs[i - 1] || '').toLowerCase();

    if (/^\d+$/.test(seg)) {
      if (prev === 'obras') {
        const idObra = Number(seg);
        const nome =
          extra?.obras?.find((o) => o.id === idObra)?.nome ??
          extra?.obraNome ??
          parsed?.searchParams?.get('obraNome') ??
          null;
        labels.push(nome ? String(nome) : `Obra #${idObra}`);
        continue;
      }
      labels.push(`#${seg}`);
      continue;
    }

    labels.push(map[lower] || (seg.length ? seg[0].toUpperCase() + seg.slice(1) : seg));
  }

  const base = labels.filter(Boolean).join(' → ');
  if (!base) return suffix;
  if (base.includes('RH → Pessoas') || base.endsWith('RH → Pessoas') || base.endsWith('Pessoas')) return base;
  if (base.startsWith('RH →') || base === 'RH') return `${base} → Pessoas`;
  if (base.endsWith('RH')) return `${base} → Pessoas`;
  return `${base} → ${suffix}`;
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
  const searchParams = useSearchParams();
  const returnToParam = searchParams.get('returnTo');
  const sessionKey = 'rh_pessoas:returnTo';
  const [returnTo, setReturnTo] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [obras, setObras] = useState<SelectItem[]>([]);
  const [contratos, setContratos] = useState<ContratoSelectItem[]>([]);
  const [rows, setRows] = useState<PessoaRow[]>([]);
  const [alertasLoading, setAlertasLoading] = useState(false);
  const [alertasByKey, setAlertasByKey] = useState<Record<string, ChecklistAlertaDTO>>({});

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
  const [modalFuncionarioMsg, setModalFuncionarioMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [modalTerceirizadoMsg, setModalTerceirizadoMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [cargoSugestoesOpen, setCargoSugestoesOpen] = useState(false);
  const [cargoOutroOpen, setCargoOutroOpen] = useState(false);
  const [cargoOutroNome, setCargoOutroNome] = useState('');
  const [cargosDb, setCargosDb] = useState<string[]>([]);
  const [cargosDbLoading, setCargosDbLoading] = useState(false);
  const cargosDisponiveis = useMemo(() => cargosDb, [cargosDb]);
  const [formFuncionario, setFormFuncionario] = useState({
    matricula: '',
    nomeCompleto: '',
    cpf: '',
    telefoneWhatsapp: '',
    dataNascimento: '',
    rg: '',
    nomeMae: '',
    nomePai: '',
    cargoContratual: '',
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
    try {
      const safe = safeInternalPath(returnToParam);
      if (safe) {
        sessionStorage.setItem(sessionKey, safe);
        setReturnTo(safe);
        return;
      }
      const stored = safeInternalPath(sessionStorage.getItem(sessionKey));
      setReturnTo(stored);
    } catch {
      setReturnTo(safeInternalPath(returnToParam));
    }
  }, [returnToParam, sessionKey]);

  const backHref = useMemo(() => safeInternalPath(returnTo) || '/dashboard/rh/painel', [returnTo]);

  const breadcrumb = useMemo(() => {
    const parsed = parseInternalPath(returnTo);
    const obraMatch = String(parsed?.pathname || '').match(/\/dashboard\/engenharia\/obras\/(\d+)/);
    const idObra = obraMatch?.[1] ? Number(obraMatch[1]) : NaN;
    const obraNome = Number.isFinite(idObra) ? obras.find((o) => o.id === idObra)?.nome ?? null : null;
    return breadcrumbFromReturnTo(returnTo, { obraNome, obras });
  }, [returnTo, obras]);

  async function carregarCargosDb() {
    try {
      setCargosDbLoading(true);
      const estrutura = await OrganogramaApi.obterEstrutura();
      const list = (estrutura?.cargos || [])
        .filter((c) => Boolean(c?.ativo))
        .map((c) => String(c.nomeCargo || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      setCargosDb(list);
    } catch {
      setCargosDb([]);
    } finally {
      setCargosDbLoading(false);
    }
  }

  useEffect(() => {
    if (!modalFuncionario) return;
    if (cargosDb.length) return;
    carregarCargosDb();
  }, [modalFuncionario, cargosDb.length]);

  useEffect(() => {
    const enabled = modalTerceirizado;
    if (!enabled) return;
    const q = String(formTerceirizado.empresaNome || '').trim();
    const qKey = q.length >= 2 ? q : '';
    if (!qKey && empresasSugestoes.length) return;

    let cancelled = false;
    setEmpresasSugestoesLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (qKey) params.set('q', qKey);
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
    }, qKey ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [modalTerceirizado, formTerceirizado.empresaNome, empresasSugestoes.length]);

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

  const autoFilterReadyRef = useRef(false);
  useEffect(() => {
    if (!autoFilterReadyRef.current) return;
    carregar();
  }, [filtros.tipo, filtros.status, filtros.idObra, filtros.idContrato]);

  useEffect(() => {
    if (!autoFilterReadyRef.current) return;
    const t = window.setTimeout(() => carregar(), 350);
    return () => window.clearTimeout(t);
  }, [filtros.busca]);

  useEffect(() => {
    carregarListasBase();
    carregar();
    autoFilterReadyRef.current = true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function carregarAlertas() {
      try {
        if (loading) return;
        if (!rows.length) {
          setAlertasByKey({});
          return;
        }

        setAlertasLoading(true);
        const funcs = rows.filter((r) => r.tipo === 'FUNCIONARIO').map((r) => r.id);
        const tercs = rows.filter((r) => r.tipo === 'TERCEIRIZADO').map((r) => r.id);

        const [rFunc, rTerc] = await Promise.all([
          funcs.length ? api.get('/api/v1/rh/pessoas/checklist-alertas', { params: { tipoVinculo: 'FUNCIONARIO', ids: funcs.slice(0, 200).join(',') } }) : Promise.resolve(null as any),
          tercs.length ? api.get('/api/v1/rh/pessoas/checklist-alertas', { params: { tipoVinculo: 'TERCEIRIZADO', ids: tercs.slice(0, 200).join(',') } }) : Promise.resolve(null as any),
        ]);

        const dataFunc = rFunc ? ((rFunc.data?.data ?? rFunc.data) as any) : [];
        const dataTerc = rTerc ? ((rTerc.data?.data ?? rTerc.data) as any) : [];

        const list = ([] as any[]).concat(Array.isArray(dataFunc) ? dataFunc : [], Array.isArray(dataTerc) ? dataTerc : []);

        const next: Record<string, ChecklistAlertaDTO> = {};
        for (const a of list) {
          const pessoaId = Number(a?.pessoaId);
          const tipoVinculo = String(a?.tipoVinculo || '').toUpperCase() === 'TERCEIRIZADO' ? 'TERCEIRIZADO' : 'FUNCIONARIO';
          if (!Number.isFinite(pessoaId) || pessoaId <= 0) continue;
          next[`${tipoVinculo}-${pessoaId}`] = {
            pessoaId,
            tipoVinculo: tipoVinculo as any,
            nivel: (a?.nivel as ChecklistAlertaNivel) || 'PENDENTE',
            tooltip: String(a?.tooltip || ''),
            resumo: a?.resumo as any,
          };
        }
        if (!cancelled) setAlertasByKey(next);
      } catch {
        if (!cancelled) setAlertasByKey({});
      } finally {
        if (!cancelled) setAlertasLoading(false);
      }
    }
    carregarAlertas();
    return () => {
      cancelled = true;
    };
  }, [loading, rows]);

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

  function abrirFicha(row: PessoaRow) {
    const returnTo = encodeURIComponent(currentPath());
    const tipo = row.tipo === 'FUNCIONARIO' ? 'funcionario' : 'terceirizado';
    router.push(`/dashboard/rh/pessoas/${tipo}/${row.id}?returnTo=${returnTo}`);
  }

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
            <h1 className="text-2xl font-semibold text-slate-900">Pessoas</h1>
            <p className="text-sm text-slate-600">{breadcrumb}</p>
          </div>
        </div>

        <div className="mt-0.5 flex gap-2 flex-wrap justify-end">
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 inline-flex items-center gap-2"
            onClick={() => {
              setModalFuncionarioMsg(null);
              setModalFuncionario(true);
            }}
          >
            <Plus size={16} />
            Novo funcionário
          </button>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 inline-flex items-center gap-2"
            onClick={() => {
              setModalTerceirizadoMsg(null);
              setModalTerceirizado(true);
            }}
          >
            <Plus size={16} />
            Novo terceirizado
          </button>
          <button type="button" className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-700" onClick={gotoPresencas}>
            Presença da obra
          </button>
          <button type="button" className="rounded-lg bg-amber-500 px-4 py-2 text-sm text-white hover:bg-amber-600" onClick={gotoDashboardRh}>
            Dashboard RH
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 rounded-lg bg-slate-50 p-1">
              <button
                type="button"
                className={classNames(
                  'rounded-md px-3 py-1.5 text-sm',
                  filtros.tipo === 'TODOS' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:bg-white/60'
                )}
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
                className={classNames(
                  'rounded-md px-3 py-1.5 text-sm',
                  filtros.status === 'TODOS' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:bg-white/60'
                )}
                onClick={() => setFiltros((p) => ({ ...p, status: 'TODOS' }))}
              >
                Todos
              </button>
              <button
                type="button"
                className={classNames(
                  'rounded-md px-3 py-1.5 text-sm',
                  filtros.status === 'ATIVO' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:bg-white/60'
                )}
                onClick={() => setFiltros((p) => ({ ...p, status: 'ATIVO' }))}
              >
                Ativo
              </button>
              <button
                type="button"
                className={classNames(
                  'rounded-md px-3 py-1.5 text-sm',
                  filtros.status === 'INATIVO' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:bg-white/60'
                )}
                onClick={() => setFiltros((p) => ({ ...p, status: 'INATIVO' }))}
              >
                Inativo
              </button>
            </div>
          </div>
        </div>

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

          <div className="md:col-span-8">
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
          <div />
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
                <th className="px-3 py-2">Alerta</th>
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
                  <td className="px-3 py-6 text-slate-600" colSpan={12}>
                    Carregando...
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((r) => (
                  <tr key={`${r.tipo}-${r.id}`} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2">
                      {(() => {
                        const a = alertasByKey[`${r.tipo}-${r.id}`] || null;
                        const tip = a?.tooltip || (alertasLoading ? 'Carregando alertas...' : 'Sem informações de alerta.');
                        const nivel: ChecklistAlertaNivel = a?.nivel || (alertasLoading ? 'PENDENTE' : 'PENDENTE');
                        if (nivel === 'OK') {
                          return (
                            <div className="inline-flex items-center" title={tip}>
                              <CheckCircle size={18} className="text-emerald-600" />
                            </div>
                          );
                        }
                        if (nivel === 'VENCIDO') {
                          return (
                            <div className="inline-flex items-center" title={tip}>
                              <XCircle size={18} className="text-rose-600" />
                            </div>
                          );
                        }
                        if (nivel === 'SEM_VINCULO') {
                          return (
                            <div className="inline-flex items-center" title={tip}>
                              <TriangleAlert size={18} className="text-slate-400" />
                            </div>
                          );
                        }
                        if (nivel === 'PENDENTE_OBRIG') {
                          return (
                            <div className="inline-flex items-center" title={tip}>
                              <TriangleAlert size={18} className="text-amber-600" />
                            </div>
                          );
                        }
                        if (nivel === 'A_VENCER') {
                          return (
                            <div className="inline-flex items-center" title={tip}>
                              <TriangleAlert size={18} className="text-amber-600" />
                            </div>
                          );
                        }
                        return (
                          <div className="inline-flex items-center" title={tip}>
                            <TriangleAlert size={18} className="text-slate-500" />
                          </div>
                        );
                      })()}
                    </td>
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
                          title={r.tipo === 'FUNCIONARIO' ? 'Ficha do funcionário' : 'Ficha do terceirizado'}
                          className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
                          onClick={() => abrirFicha(r)}
                        >
                          {r.tipo === 'FUNCIONARIO' ? <User size={16} /> : <Building2 size={16} />}
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
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={12}>
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
          {modalFuncionarioMsg ? (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                modalFuncionarioMsg.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {modalFuncionarioMsg.text}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs text-slate-600 mb-1">Matrícula</div>
              <input
                className="input"
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
            <div>
              <div className="text-xs text-slate-600 mb-1">Telefone / WhatsApp</div>
              <input
                className="input"
                placeholder="(00) 00000-0000"
                value={formFuncionario.telefoneWhatsapp}
                onChange={(e) => setFormFuncionario((p) => ({ ...p, telefoneWhatsapp: formatPhoneBr(e.target.value) }))}
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
              <div className="text-xs text-slate-600 mb-1">Nome da mãe</div>
              <input className="input" value={formFuncionario.nomeMae} onChange={(e) => setFormFuncionario((p) => ({ ...p, nomeMae: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Nome do pai</div>
              <input className="input" value={formFuncionario.nomePai} onChange={(e) => setFormFuncionario((p) => ({ ...p, nomePai: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Cargo</div>
              <div className="relative">
                <input
                  className="input"
                  value={formFuncionario.cargoContratual}
                  placeholder="Selecione ou digite para filtrar"
                  onFocus={() => setCargoSugestoesOpen(true)}
                  onBlur={() => window.setTimeout(() => setCargoSugestoesOpen(false), 150)}
                  onChange={(e) => {
                    setFormFuncionario((p) => ({ ...p, cargoContratual: e.target.value }));
                    setCargoSugestoesOpen(true);
                  }}
                />
                {cargoSugestoesOpen ? (
                  <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                    <div className="max-h-64 overflow-auto">
                      {cargosDbLoading && !cargosDisponiveis.length ? (
                        <div className="px-3 py-2 text-sm text-slate-600">Carregando cargos…</div>
                      ) : null}
                      {cargosDisponiveis
                        .filter((c) => c.toLowerCase().includes(String(formFuncionario.cargoContratual || '').trim().toLowerCase()))
                        .slice(0, 30)
                        .map((c) => (
                          <button
                            key={c}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => {
                              setFormFuncionario((p) => ({ ...p, cargoContratual: c }));
                              setCargoSugestoesOpen(false);
                              setCargoOutroOpen(false);
                            }}
                          >
                            {c}
                          </button>
                        ))}
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm font-semibold text-blue-700 hover:bg-slate-50"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => {
                          setCargoSugestoesOpen(false);
                          setCargoOutroOpen(true);
                          setCargoOutroNome('');
                        }}
                      >
                        Outro…
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {cargoOutroOpen ? (
              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-600 mb-2">Adicionar outro cargo</div>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <input className="input flex-1" value={cargoOutroNome} onChange={(e) => setCargoOutroNome(e.target.value)} placeholder="Digite o nome do cargo" />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setCargoOutroOpen(false);
                        setCargoOutroNome('');
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-60"
                      disabled={!String(cargoOutroNome || '').trim() || cargosDbLoading}
                      onClick={async () => {
                        const novo = String(cargoOutroNome || '').trim();
                        if (!novo) return;
                        try {
                          setCargosDbLoading(true);
                          await OrganogramaApi.criarCargo({ nomeCargo: novo });
                          await carregarCargosDb();
                          setFormFuncionario((p) => ({ ...p, cargoContratual: novo }));
                          setCargoOutroOpen(false);
                          setCargoOutroNome('');
                        } catch (e: any) {
                          setModalFuncionarioMsg({
                            kind: 'error',
                            text: `Falha ao salvar cargo no banco: ${e?.message || 'Erro ao criar cargo'}`,
                          });
                        } finally {
                          setCargosDbLoading(false);
                        }
                      }}
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            <div>
              <div className="text-xs text-slate-600 mb-1">Tipo de vínculo</div>
              <select className="input" value={formFuncionario.tipoVinculo} onChange={(e) => setFormFuncionario((p) => ({ ...p, tipoVinculo: e.target.value }))}>
                <option value="CLT">CLT</option>
                <option value="ESTAGIO">Estágio</option>
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
                  setModalFuncionarioMsg(null);
                  const cpfDigits = onlyDigits(formFuncionario.cpf || '');
                  if (cpfDigits.length !== 11) throw new Error('Campo CPF: deve ter 11 dígitos.');
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(formFuncionario.dataNascimento || '').slice(0, 10))) {
                    throw new Error('Campo Data de nascimento: inválida.');
                  }
                  const matricula = String(formFuncionario.matricula || '').trim();
                  if (!matricula) throw new Error('Campo Matrícula: obrigatória.');
                  const telDigits = onlyDigits(formFuncionario.telefoneWhatsapp || '');
                  if (telDigits && telDigits.length !== 10 && telDigits.length !== 11) {
                    throw new Error('Campo Telefone/WhatsApp: deve ter 10 ou 11 dígitos (com DDD).');
                  }
                  await FuncionariosApi.criar({
                    matricula,
                    nomeCompleto: String(formFuncionario.nomeCompleto || '').trim(),
                    cpf: cpfDigits,
                    telefoneWhatsapp: telDigits ? telDigits : null,
                    dataNascimento: String(formFuncionario.dataNascimento || '').slice(0, 10),
                    rg: String(formFuncionario.rg || '').trim() ? String(formFuncionario.rg || '').trim() : null,
                    nomeMae: String(formFuncionario.nomeMae || '').trim() ? String(formFuncionario.nomeMae || '').trim() : null,
                    nomePai: String(formFuncionario.nomePai || '').trim() ? String(formFuncionario.nomePai || '').trim() : null,
                    cargoContratual: String(formFuncionario.cargoContratual || '').trim() ? String(formFuncionario.cargoContratual || '').trim() : null,
                    tipoVinculo: String(formFuncionario.tipoVinculo || '').trim() ? String(formFuncionario.tipoVinculo || '').trim() : null,
                    dataAdmissao: String(formFuncionario.dataAdmissao || '').slice(0, 10) ? String(formFuncionario.dataAdmissao || '').slice(0, 10) : null,
                    ativo: true,
                  });
                  setFormFuncionario({
                    matricula: '',
                    nomeCompleto: '',
                    cpf: '',
                    telefoneWhatsapp: '',
                    dataNascimento: '',
                    rg: '',
                    nomeMae: '',
                    nomePai: '',
                    cargoContratual: '',
                    tipoVinculo: 'CLT',
                    dataAdmissao: '',
                  });
                  await carregar();
                  setModalFuncionarioMsg({ kind: 'success', text: 'Funcionário cadastrado com sucesso.' });
                  window.setTimeout(() => setModalFuncionarioMsg(null), 4000);
                } catch (e: any) {
                  setModalFuncionarioMsg({ kind: 'error', text: `Falha no cadastro (Funcionário): ${e?.message || 'Erro ao criar funcionário'}` });
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
          {modalTerceirizadoMsg ? (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                modalTerceirizadoMsg.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {modalTerceirizadoMsg.text}
            </div>
          ) : null}
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
                onChange={(e) => setFormTerceirizado((p) => ({ ...p, telefoneWhatsapp: formatPhoneBr(e.target.value) }))}
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
                            <div className="text-slate-900">{`#${r.id} - ${r.nome} - ${formatCnpjCpf(r.documento) || '-'}`}</div>
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
                  setModalTerceirizadoMsg(null);
                  const cpfDigits = onlyDigits(formTerceirizado.cpf || '');
                  if (cpfDigits.length !== 11) throw new Error('Campo CPF: deve ter 11 dígitos.');
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(formTerceirizado.dataNascimento || '').slice(0, 10))) {
                    throw new Error('Campo Data de nascimento: inválida.');
                  }
                  const telDigits = onlyDigits(formTerceirizado.telefoneWhatsapp || '');
                  if (telDigits && telDigits.length !== 10 && telDigits.length !== 11) {
                    throw new Error('Campo Telefone/WhatsApp: deve ter 10 ou 11 dígitos (com DDD).');
                  }
                  await TerceirizadosApi.criar({
                    nomeCompleto: formTerceirizado.nomeCompleto,
                    cpf: cpfDigits,
                    dataNascimento: String(formTerceirizado.dataNascimento || '').slice(0, 10),
                    funcao: formTerceirizado.funcao || null,
                    telefoneWhatsapp: telDigits ? telDigits : null,
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
                  await carregar();
                  setModalTerceirizadoMsg({ kind: 'success', text: 'Terceirizado cadastrado com sucesso.' });
                  window.setTimeout(() => setModalTerceirizadoMsg(null), 4000);
                } catch (e: any) {
                  setModalTerceirizadoMsg({ kind: 'error', text: `Falha no cadastro (Terceirizado): ${e?.message || 'Erro ao criar terceirizado'}` });
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
