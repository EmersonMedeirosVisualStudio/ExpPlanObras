'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { ArrowLeft, CircleCheck, RefreshCcw, TriangleAlert } from 'lucide-react';

type ChecklistStatus = 'OK' | 'PENDENTE' | 'PENDENTE_VALIDADE' | 'VENCIDO' | 'A_VENCER';

type ChecklistItemDTO = {
  idItem: number;
  ordemItem: number;
  grupoItem: string | null;
  tituloItem: string;
  descricaoItem: string | null;
  obrigatorio: boolean;
  exigeValidade: boolean;
  validadeDias: number | null;
  status: ChecklistStatus;
  entregueEm: string | null;
  validadeAte: string | null;
  observacao: string | null;
};

type ChecklistResponseDTO = {
  pessoa: { id: number; nomeCompleto: string; cpf: string };
  vinculo: {
    id: number;
    tipoVinculo: 'FUNCIONARIO' | 'TERCEIRIZADO';
    matricula: string | null;
    funcao: string | null;
    empresa: { id: number; nome: string } | null;
  };
  modelo: { id: number; codigo: string; nomeModelo: string; tipoVinculo: string };
  execucao: { id: number; status: string; iniciadoEm: string; finalizadoEm: string | null };
  itens: ChecklistItemDTO[];
  resumo: { total: number; ok: number; pendente: number; vencido: number; aVencer: number; obrigatoriosPendentes: number };
};

function safeInternalPath(v: string | null) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (!s.startsWith('/')) return null;
  if (s.startsWith('//')) return null;
  return s;
}

function parseInternalPath(path: string | null) {
  const p = safeInternalPath(path);
  if (!p) return null;
  try {
    const u = new URL(`http://local${p}`);
    return { pathname: u.pathname, searchParams: u.searchParams };
  } catch {
    return null;
  }
}

function extractObraIdFromPath(pathname: string | null) {
  const p = String(pathname || '');
  const m = p.match(/\/dashboard\/engenharia\/obras\/(\d+)(\/|$)/i);
  if (!m?.[1]) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function breadcrumbFromReturnTo(returnTo: string | null, extra?: { obraNome?: string | null; contratoNumero?: string | null }) {
  const parsed = parseInternalPath(returnTo);
  const rt = String(returnTo || '').toLowerCase();
  const suffix = 'RH → Pessoas → Checklist de documentos';
  if (!rt) return suffix;

  if (/\/dashboard\/engenharia\/obras\/\d+/.test(rt) || rt.includes('/dashboard/engenharia/obras/cadastro')) {
    const obraNome = extra?.obraNome ?? parsed?.searchParams?.get('obraNome');
    const contratoNumero = extra?.contratoNumero ?? parsed?.searchParams?.get('contratoNumero');
    const obraLabel = obraNome ? String(obraNome) : 'Obra selecionada';
    const contratoLabel = contratoNumero ? ` — Contrato: ${String(contratoNumero)}` : '';
    return `Engenharia → Obras → ${obraLabel}${contratoLabel} → ${suffix}`;
  }
  if (rt.includes('/dashboard/engenharia/obras')) return `Engenharia → Obras → ${suffix}`;
  if (rt.includes('/dashboard/engenharia/projetos')) return `Engenharia → Projetos → ${suffix}`;
  if (rt.includes('/dashboard/rh/presencas')) return `RH → Presenças → Checklist de documentos`;
  if (rt.includes('/dashboard/rh/cadastros')) return suffix;
  if (rt.includes('/dashboard')) return `Dashboard → ${suffix}`;
  return suffix;
}

function fmtDateTime(v?: string | null) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('pt-BR');
}

function groupByGrupo(itens: ChecklistItemDTO[]) {
  const map = new Map<string, ChecklistItemDTO[]>();
  for (const i of itens) {
    const g = String(i.grupoItem || '').trim() || 'GERAL';
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(i);
  }
  const grupos = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { map, grupos };
}

function statusUi(s: ChecklistStatus) {
  if (s === 'OK') return { label: 'OK', kind: 'ok' as const };
  if (s === 'VENCIDO') return { label: 'Vencido', kind: 'irregular' as const };
  if (s === 'A_VENCER') return { label: 'A vencer', kind: 'alerta' as const };
  if (s === 'PENDENTE_VALIDADE') return { label: 'Validar validade', kind: 'alerta' as const };
  return { label: 'Pendente', kind: 'pendente' as const };
}

export default function ChecklistRhClient() {
  const router = useRouter();
  const params = useParams<{ tipo: string; id: string }>();
  const sp = useSearchParams();

  const tipoPath = String(params?.tipo || '').toLowerCase();
  const idNum = Number(params?.id || 0);
  const isTerceirizado = tipoPath.includes('terceir');
  const tipoVinculo = isTerceirizado ? 'TERCEIRIZADO' : 'FUNCIONARIO';

  const returnTo = useMemo(() => safeInternalPath(sp.get('returnTo') || null), [sp]);
  const sessionKey = useMemo(() => `rh_checklist_returnTo:${tipoPath || 'tipo'}:${String(idNum || 0)}`, [tipoPath, idNum]);
  const [backHref, setBackHref] = useState(() => returnTo || '/dashboard/rh/cadastros');
  const [breadcrumb, setBreadcrumb] = useState(() => breadcrumbFromReturnTo(returnTo));

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pessoa, setPessoa] = useState<ChecklistResponseDTO['pessoa'] | null>(null);
  const [vinculo, setVinculo] = useState<ChecklistResponseDTO['vinculo'] | null>(null);
  const [modelo, setModelo] = useState<ChecklistResponseDTO['modelo'] | null>(null);
  const [itens, setItens] = useState<ChecklistItemDTO[]>([]);
  const [resumo, setResumo] = useState<ChecklistResponseDTO['resumo'] | null>(null);

  const [grupoFiltro, setGrupoFiltro] = useState<string>('TODOS');
  const [situacaoFiltro, setSituacaoFiltro] = useState<'TODAS' | 'OK' | 'PENDENTE' | 'A_VENCER' | 'VENCIDO'>('TODAS');
  const [busca, setBusca] = useState<string>('');
  const [validadeDraft, setValidadeDraft] = useState<Record<number, string>>({});
  const [observacaoDraft, setObservacaoDraft] = useState<Record<number, string>>({});

  const carregar = useCallback(async () => {
    if (!Number.isFinite(idNum) || idNum <= 0) return;
    try {
      setLoading(true);
      setErro(null);
      if (!tipoVinculo) throw new Error('Tipo inválido');

      const r = await api.get(`/api/v1/rh/pessoas/${idNum}/checklist`, { params: { tipoVinculo } });
      const data = (r?.data?.data || r?.data) as ChecklistResponseDTO;
      if (!data?.pessoa?.id) throw new Error('Resposta inválida');

      setPessoa(data.pessoa);
      setVinculo(data.vinculo);
      setModelo(data.modelo);
      setItens(Array.isArray(data.itens) ? data.itens : []);
      setResumo(data.resumo || null);

      const vd: Record<number, string> = {};
      const od: Record<number, string> = {};
      for (const item of Array.isArray(data.itens) ? data.itens : []) {
        if (item.validadeAte) vd[item.idItem] = String(item.validadeAte).slice(0, 10);
        if (item.observacao) od[item.idItem] = String(item.observacao);
      }
      setValidadeDraft(vd);
      setObservacaoDraft(od);
    } catch (e: any) {
      setErro(e?.response?.data?.message || e?.message || 'Erro ao carregar checklist');
      setPessoa(null);
      setVinculo(null);
      setModelo(null);
      setItens([]);
      setResumo(null);
    } finally {
      setLoading(false);
    }
  }, [idNum, tipoVinculo]);

  const atualizarItem = useCallback(
    async (item: ChecklistItemDTO, next: 'ENTREGUE' | 'PENDENTE') => {
      try {
        setErro(null);
        if (loading) return;

        const validadeAte = validadeDraft[item.idItem] ? String(validadeDraft[item.idItem]).slice(0, 10) : null;
        const observacao = observacaoDraft[item.idItem] != null ? String(observacaoDraft[item.idItem]) : null;

        if (next === 'ENTREGUE' && item.exigeValidade && (!validadeAte || !/^\d{4}-\d{2}-\d{2}$/.test(validadeAte))) {
          setErro('Preencha a validade (data) antes de marcar como entregue.');
          return;
        }

        await api.patch(`/api/v1/rh/pessoas/${idNum}/checklist/itens/${item.idItem}`, {
          tipoVinculo,
          status: next,
          validadeAte,
          observacao,
        });
        await carregar();
      } catch (e: any) {
        setErro(e?.response?.data?.message || e?.message || 'Erro ao atualizar item');
      }
    },
    [carregar, idNum, loading, observacaoDraft, tipoVinculo, validadeDraft]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    try {
      if (returnTo) sessionStorage.setItem(sessionKey, returnTo);
    } catch {}
  }, [returnTo, sessionKey]);

  useEffect(() => {
    try {
      const stored = safeInternalPath(sessionStorage.getItem(sessionKey));
      setBackHref(stored || returnTo || '/dashboard/rh/cadastros');
    } catch {
      setBackHref(returnTo || '/dashboard/rh/cadastros');
    }
  }, [returnTo, sessionKey]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const parsed = parseInternalPath(returnTo);
      const obraNome = parsed?.searchParams?.get('obraNome') || null;
      const contratoNumero = parsed?.searchParams?.get('contratoNumero') || null;
      if (obraNome || contratoNumero) {
        setBreadcrumb(breadcrumbFromReturnTo(returnTo, { obraNome, contratoNumero }));
        return;
      }
      const obraId = extractObraIdFromPath(parsed?.pathname || null);
      if (!obraId) {
        setBreadcrumb(breadcrumbFromReturnTo(returnTo));
        return;
      }
      try {
        const r = await fetch('/api/v1/dashboard/me/filtros', { cache: 'no-store' }).then((x) => x.json().catch(() => null));
        if (cancelled) return;
        const data = r?.data || r;
        const obras = Array.isArray(data?.obras) ? data.obras : [];
        const found = obras.find((o: any) => Number(o.id) === obraId);
        const obraNomeReal = found?.nome ? String(found.nome) : null;
        setBreadcrumb(breadcrumbFromReturnTo(returnTo, { obraNome: obraNomeReal, contratoNumero: null }));
      } catch {
        if (cancelled) return;
        setBreadcrumb(breadcrumbFromReturnTo(returnTo));
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [returnTo]);

  const agrupado = useMemo(() => groupByGrupo(itens), [itens]);
  const grupos = useMemo(() => ['TODOS', ...agrupado.grupos], [agrupado.grupos]);

  const itensFiltrados = useMemo(() => {
    let out = itens;
    if (grupoFiltro !== 'TODOS') out = out.filter((i) => String(i.grupoItem || '').trim() === grupoFiltro);
    if (situacaoFiltro !== 'TODAS') {
      out = out.filter((i) => i.status === situacaoFiltro);
    }
    const q = String(busca || '').trim().toLowerCase();
    if (q) {
      out = out.filter((i) => {
        const t = String(i.tituloItem || '').toLowerCase();
        const d = String(i.descricaoItem || '').toLowerCase();
        const g = String(i.grupoItem || '').toLowerCase();
        return t.includes(q) || d.includes(q) || g.includes(q) || String(i.idItem).includes(q);
      });
    }
    return out;
  }, [busca, grupoFiltro, itens, situacaoFiltro]);

  const agrupadoFiltrado = useMemo(() => groupByGrupo(itensFiltrados), [itensFiltrados]);

  const grupoSelecionado = grupoFiltro === 'TODOS' ? agrupadoFiltrado.grupos[0] || 'TODOS' : grupoFiltro;
  const listaGrupos = useMemo(() => {
    return agrupado.grupos.map((g) => ({ g, total: agrupado.map.get(g)?.length || 0 }));
  }, [agrupado.grupos, agrupado.map]);

  return (
    <div className="p-6 space-y-6 text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold text-slate-900">Checklist (RH) — {isTerceirizado ? 'Terceirizado' : 'Funcionário'}</h1>
          <div className="mt-1 text-sm text-slate-600">
            {pessoa?.nomeCompleto ? pessoa.nomeCompleto : `Pessoa #${idNum}`}
            {pessoa?.cpf ? ` — CPF: ${pessoa.cpf}` : ''}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {vinculo?.matricula ? `Matrícula: ${vinculo.matricula}` : ''}
            {vinculo?.funcao ? `${vinculo?.matricula ? ' — ' : ''}Função: ${vinculo.funcao}` : ''}
            {vinculo?.empresa?.nome ? ` — Empresa: ${vinculo.empresa.nome}` : ''}
            {modelo?.nomeModelo ? ` — Modelo: ${modelo.nomeModelo}` : ''}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2" type="button" onClick={() => router.push(backHref)}>
            <ArrowLeft size={16} />
            Voltar
          </button>
          <button
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
            type="button"
            onClick={carregar}
            disabled={loading}
          >
            <RefreshCcw size={16} />
            Atualizar
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Total de itens</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{loading ? '—' : resumo?.total ?? 0}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-emerald-800">Itens OK</div>
            <CircleCheck className="text-emerald-700" size={18} />
          </div>
          <div className="mt-1 text-2xl font-semibold text-emerald-900">{loading ? '—' : resumo?.ok ?? 0}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-amber-800">Pendentes</div>
            <TriangleAlert className="text-amber-700" size={18} />
          </div>
          <div className="mt-1 text-2xl font-semibold text-amber-900">{loading ? '—' : resumo?.pendente ?? 0}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-rose-800">Vencidos</div>
            <TriangleAlert className="text-rose-700" size={18} />
          </div>
          <div className="mt-1 text-2xl font-semibold text-rose-900">{loading ? '—' : resumo?.vencido ?? 0}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <div className="text-xs text-slate-600 mb-1">Grupo</div>
            <select className="input" value={grupoFiltro} onChange={(e) => setGrupoFiltro(e.target.value)}>
              {grupos.map((g) => (
                <option key={g} value={g}>
                  {g === 'TODOS' ? 'Todos' : g}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <div className="text-xs text-slate-600 mb-1">Situação</div>
            <select className="input" value={situacaoFiltro} onChange={(e) => setSituacaoFiltro(e.target.value as any)}>
              <option value="TODAS">Todas</option>
              <option value="OK">OK</option>
              <option value="PENDENTE">Pendentes</option>
              <option value="A_VENCER">A vencer</option>
              <option value="VENCIDO">Vencidos</option>
            </select>
          </div>
          <div className="md:col-span-4">
            <div className="text-xs text-slate-600 mb-1">Buscar</div>
            <input className="input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por item, grupo ou id..." />
          </div>
          <div className="md:col-span-2 flex items-end justify-end">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setGrupoFiltro('TODOS');
                setSituacaoFiltro('TODAS');
                setBusca('');
              }}
            >
              Limpar filtros
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <aside className="lg:col-span-3">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b bg-slate-50 px-4 py-3">
              <div className="font-semibold text-slate-900">Grupos</div>
              <div className="text-xs text-slate-500">{listaGrupos.length} grupo(s)</div>
            </div>
            <div className="p-2">
              {listaGrupos.length === 0 ? (
                <div className="px-3 py-4 text-sm text-slate-600">Nenhum grupo encontrado.</div>
              ) : (
                <div className="space-y-1">
                  {listaGrupos.map((x) => {
                    const selected = grupoFiltro === x.g;
                    return (
                      <button
                        key={x.g}
                        type="button"
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                          selected ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' : 'hover:bg-slate-50 text-slate-800'
                        }`}
                        onClick={() => setGrupoFiltro(x.g)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{x.g}</div>
                          <div className="text-xs text-slate-500">{x.total}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {resumo?.obrigatoriosPendentes != null ? (
              <div className="border-t bg-slate-50 p-3 text-xs text-slate-600">Obrigatórios com pendência: {resumo.obrigatoriosPendentes}</div>
            ) : null}
          </div>
        </aside>

        <section className="lg:col-span-9 space-y-4">
          {!loading && itensFiltrados.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Nenhum item encontrado com os filtros atuais.</div>
          ) : null}

          {Array.from(agrupadoFiltrado.map.entries())
            .filter(([g]) => grupoFiltro === 'TODOS' || g === grupoSelecionado)
            .map(([g, list]) => {
              const ordered = [...list].sort((a, b) => a.ordemItem - b.ordemItem);
              return (
                <div key={g} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
                    <div className="font-semibold text-slate-900">Grupo: {g}</div>
                    <div className="text-sm text-slate-600">{ordered.length} item(ns)</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-slate-700">
                        <tr>
                          <th className="px-4 py-2">Item</th>
                          <th className="px-4 py-2">Obrigatório</th>
                          <th className="px-4 py-2">Validade</th>
                          <th className="px-4 py-2">Status</th>
                          <th className="px-4 py-2">Entregue em</th>
                          <th className="px-4 py-2 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordered.map((item) => {
                          const s = statusUi(item.status);
                          const pill =
                            s.kind === 'ok'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : s.kind === 'pendente'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : s.kind === 'alerta'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : s.kind === 'irregular'
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : 'bg-slate-50 text-slate-700 border-slate-200';
                          return (
                            <tr key={item.idItem} className="border-t">
                              <td className="px-4 py-2">
                                <div className="font-medium text-slate-900">{item.tituloItem || `Item #${item.idItem}`}</div>
                                <div className="text-xs text-slate-500">{item.descricaoItem || ''}</div>
                                {item.exigeValidade ? (
                                  <div className="mt-2 flex items-center gap-2">
                                    <div className="text-xs text-slate-500">Validade até</div>
                                    <input
                                      className="input h-9"
                                      type="date"
                                      value={validadeDraft[item.idItem] || ''}
                                      onChange={(e) => setValidadeDraft((p) => ({ ...p, [item.idItem]: e.target.value }))}
                                    />
                                  </div>
                                ) : null}
                                <div className="mt-2">
                                  <input
                                    className="input h-9"
                                    value={observacaoDraft[item.idItem] || ''}
                                    onChange={(e) => setObservacaoDraft((p) => ({ ...p, [item.idItem]: e.target.value }))}
                                    placeholder="Observação (opcional)..."
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                {item.obrigatorio ? (
                                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">Sim</span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">Não</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-slate-600">
                                {item.exigeValidade ? (item.validadeAte ? String(item.validadeAte).slice(0, 10) : '-') : 'Não se aplica'}
                              </td>
                              <td className="px-4 py-2">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${pill}`}>{s.label}</span>
                              </td>
                              <td className="px-4 py-2 text-slate-600">{fmtDateTime(item.entregueEm)}</td>
                              <td className="px-4 py-2 text-right">
                                <div className="inline-flex items-center gap-2">
                                  {item.status === 'OK' || item.status === 'A_VENCER' ? (
                                    <button
                                      type="button"
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                      onClick={() => atualizarItem(item, 'PENDENTE')}
                                      disabled={loading}
                                    >
                                      Marcar pendente
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
                                      onClick={() => atualizarItem(item, 'ENTREGUE')}
                                      disabled={loading}
                                    >
                                      Marcar entregue
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
        </section>
      </div>
    </div>
  );
}
