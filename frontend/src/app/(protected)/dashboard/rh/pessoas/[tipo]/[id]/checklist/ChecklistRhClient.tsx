'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { DocumentosApi } from '@/lib/modules/documentos/api';
import type { DocumentoRegistroDTO } from '@/lib/modules/documentos/types';
import { FuncionariosApi } from '@/lib/modules/funcionarios/api';
import { TerceirizadosApi } from '@/lib/modules/terceirizados/api';
import { ArrowLeft, CircleCheck, ExternalLink, FileText, RefreshCcw, TriangleAlert, X } from 'lucide-react';

type PreviewState = { open: boolean; url: string | null; mime: string | null; name: string | null; versaoId: number | null; tipo: 'ORIGINAL' | 'PDF_FINAL' };

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

function groupByCategoria(docs: DocumentoRegistroDTO[]) {
  const map = new Map<string, DocumentoRegistroDTO[]>();
  for (const d of docs) {
    const cat = String(d.categoriaDocumento || '').trim() || 'SEM_CATEGORIA';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(d);
  }
  const cats = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { map, cats };
}

function statusLabel(d: DocumentoRegistroDTO) {
  const s = String(d.statusDocumento || '').toUpperCase();
  if (s === 'ASSINADO' || s === 'ATIVO') return { label: 'Completo', kind: 'ok' as const };
  if (s === 'RASCUNHO' || s === 'EM_ASSINATURA') return { label: 'Pendente', kind: 'pendente' as const };
  if (s === 'INVALIDADO' || s === 'CANCELADO') return { label: 'Irregular', kind: 'irregular' as const };
  return { label: s || '—', kind: 'neutro' as const };
}

export default function ChecklistRhClient() {
  const router = useRouter();
  const params = useParams<{ tipo: string; id: string }>();
  const sp = useSearchParams();

  const tipoPath = String(params?.tipo || '').toLowerCase();
  const idNum = Number(params?.id || 0);

  const returnTo = useMemo(() => safeInternalPath(sp.get('returnTo') || null), [sp]);
  const sessionKey = useMemo(() => `rh_checklist_returnTo:${tipoPath || 'tipo'}:${String(idNum || 0)}`, [tipoPath, idNum]);
  const [backHref, setBackHref] = useState(() => returnTo || '/dashboard/rh/cadastros');
  const [breadcrumb, setBreadcrumb] = useState(() => breadcrumbFromReturnTo(returnTo));

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nomePessoa, setNomePessoa] = useState<string>('');
  const [docs, setDocs] = useState<DocumentoRegistroDTO[]>([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('TODAS');
  const [situacaoFiltro, setSituacaoFiltro] = useState<'TODAS' | 'COMPLETO' | 'PENDENTE' | 'IRREGULAR'>('TODAS');
  const [buscaDoc, setBuscaDoc] = useState<string>('');

  const [preview, setPreview] = useState<PreviewState>({ open: false, url: null, mime: null, name: null, versaoId: null, tipo: 'ORIGINAL' });

  const carregar = useCallback(async () => {
    if (!Number.isFinite(idNum) || idNum <= 0) return;
    try {
      setLoading(true);
      setErro(null);

      const isFuncionario = tipoPath.includes('funcionario');
      const isTerceirizado = tipoPath.includes('terceir');
      if (!isFuncionario && !isTerceirizado) throw new Error('Tipo inválido');

      const entidadeTipos = isFuncionario ? ['FUNCIONARIO'] : ['TERCEIRIZADO_TRABALHADOR', 'TERCEIRIZADO'];

      const pessoa = await (isFuncionario ? FuncionariosApi.obter(idNum) : TerceirizadosApi.obter(idNum));

      let documentos: DocumentoRegistroDTO[] = [];

      for (const entidadeTipo of entidadeTipos) {
        const list = await DocumentosApi.listar({ entidadeTipo, entidadeId: idNum, categoriaPrefix: 'RH_', limit: 200 }).catch(() => []);
        if (Array.isArray(list) && list.length > 0) {
          documentos = list;
          break;
        }
      }

      if (documentos.length === 0) {
        for (const entidadeTipo of entidadeTipos) {
          const list = await DocumentosApi.listar({ entidadeTipo, entidadeId: idNum, limit: 200 }).catch(() => []);
          if (Array.isArray(list) && list.length > 0) {
            documentos = list;
            break;
          }
        }
      }

      const nome = isFuncionario ? String((pessoa as any)?.nomeCompleto || '') : String((pessoa as any)?.nomeCompleto || '');
      setNomePessoa(nome);
      setDocs(documentos);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar checklist');
      setDocs([]);
      setNomePessoa('');
    } finally {
      setLoading(false);
    }
  }, [idNum, tipoPath]);

  async function visualizar(versaoId: number, tipo: 'ORIGINAL' | 'PDF_FINAL', nome: string) {
    try {
      setErro(null);
      const res = await api.get(`/api/v1/documentos/versoes/${versaoId}/download?tipo=${tipo}`, { responseType: 'blob' as any });
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      setPreview((prev) => {
        if (prev.url) URL.revokeObjectURL(prev.url);
        return { open: true, url, mime: blob.type || 'application/octet-stream', name: nome, versaoId, tipo };
      });
    } catch (e: any) {
      setErro(e?.response?.data?.message || e?.message || 'Erro ao abrir documento');
    }
  }

  function fecharPreview() {
    setPreview((prev) => {
      if (prev.url) URL.revokeObjectURL(prev.url);
      return { open: false, url: null, mime: null, name: null, versaoId: null, tipo: 'ORIGINAL' };
    });
  }

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

  useEffect(() => {
    return () => {
      try {
        if (preview.url) URL.revokeObjectURL(preview.url);
      } catch {}
    };
  }, [preview.url]);

  const agrupado = useMemo(() => groupByCategoria(docs), [docs]);

  const categorias = useMemo(() => ['TODAS', ...agrupado.cats], [agrupado.cats]);

  const docsFiltrados = useMemo(() => {
    let out = docs;
    if (categoriaFiltro !== 'TODAS') out = out.filter((d) => String(d.categoriaDocumento || '').trim() === categoriaFiltro);
    if (situacaoFiltro !== 'TODAS') {
      out = out.filter((d) => {
        const st = statusLabel(d).kind;
        if (situacaoFiltro === 'COMPLETO') return st === 'ok';
        if (situacaoFiltro === 'PENDENTE') return st === 'pendente';
        if (situacaoFiltro === 'IRREGULAR') return st === 'irregular';
        return true;
      });
    }
    const q = String(buscaDoc || '').trim().toLowerCase();
    if (q) {
      out = out.filter((d) => {
        const t = String(d.tituloDocumento || '').toLowerCase();
        const desc = String(d.descricaoDocumento || '').toLowerCase();
        const cat = String(d.categoriaDocumento || '').toLowerCase();
        return t.includes(q) || desc.includes(q) || cat.includes(q) || String(d.id).includes(q);
      });
    }
    return out;
  }, [docs, categoriaFiltro, situacaoFiltro, buscaDoc]);

  const agrupadoFiltrado = useMemo(() => groupByCategoria(docsFiltrados), [docsFiltrados]);

  const resumo = useMemo(() => {
    const base = docs;
    const total = base.length;
    const c = base.filter((d) => statusLabel(d).kind === 'ok').length;
    const p = base.filter((d) => statusLabel(d).kind === 'pendente').length;
    const i = base.filter((d) => statusLabel(d).kind === 'irregular').length;
    return { total, completos: c, pendentes: p, irregulares: i, vencidos: 0 };
  }, [docs]);

  const categoriaSelecionada = categoriaFiltro === 'TODAS' ? agrupadoFiltrado.cats[0] || 'TODAS' : categoriaFiltro;
  const listaCategorias = useMemo(() => {
    return agrupado.cats.map((cat) => ({ cat, total: agrupado.map.get(cat)?.length || 0 }));
  }, [agrupado.cats, agrupado.map]);

  return (
    <div className="p-6 space-y-6 text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold text-slate-900">Checklist por categoria (RH)</h1>
          <div className="mt-1 text-sm text-slate-600">{nomePessoa ? nomePessoa : `Pessoa #${idNum}`}</div>
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
          <div className="text-xs text-slate-500">Total de documentos</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{loading ? '—' : resumo.total}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-emerald-800">Documentos completos</div>
            <CircleCheck className="text-emerald-700" size={18} />
          </div>
          <div className="mt-1 text-2xl font-semibold text-emerald-900">{loading ? '—' : resumo.completos}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-amber-800">Documentos pendentes</div>
            <TriangleAlert className="text-amber-700" size={18} />
          </div>
          <div className="mt-1 text-2xl font-semibold text-amber-900">{loading ? '—' : resumo.pendentes}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-rose-800">Documentos irregulares</div>
            <TriangleAlert className="text-rose-700" size={18} />
          </div>
          <div className="mt-1 text-2xl font-semibold text-rose-900">{loading ? '—' : resumo.irregulares}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <div className="text-xs text-slate-600 mb-1">Categoria</div>
            <select className="input" value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c === 'TODAS' ? 'Todas' : c}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <div className="text-xs text-slate-600 mb-1">Situação</div>
            <select className="input" value={situacaoFiltro} onChange={(e) => setSituacaoFiltro(e.target.value as any)}>
              <option value="TODAS">Todas</option>
              <option value="COMPLETO">Completos</option>
              <option value="PENDENTE">Pendentes</option>
              <option value="IRREGULAR">Irregulares</option>
            </select>
          </div>
          <div className="md:col-span-4">
            <div className="text-xs text-slate-600 mb-1">Buscar</div>
            <input className="input" value={buscaDoc} onChange={(e) => setBuscaDoc(e.target.value)} placeholder="Buscar por título, categoria ou id..." />
          </div>
          <div className="md:col-span-2 flex items-end justify-end">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setCategoriaFiltro('TODAS');
                setSituacaoFiltro('TODAS');
                setBuscaDoc('');
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
              <div className="font-semibold text-slate-900">Categorias</div>
              <div className="text-xs text-slate-500">{listaCategorias.length} categoria(s)</div>
            </div>
            <div className="p-2">
              {listaCategorias.length === 0 ? (
                <div className="px-3 py-4 text-sm text-slate-600">Nenhuma categoria encontrada.</div>
              ) : (
                <div className="space-y-1">
                  {listaCategorias.map((c) => {
                    const selected = categoriaFiltro === c.cat;
                    return (
                      <button
                        key={c.cat}
                        type="button"
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                          selected ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' : 'hover:bg-slate-50 text-slate-800'
                        }`}
                        onClick={() => setCategoriaFiltro(c.cat)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{c.cat}</div>
                          <div className="text-xs text-slate-500">{c.total}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t bg-slate-50 p-3 text-xs text-slate-600">
              Documentos marcados como RH normalmente usam categorias com prefixo RH_.
            </div>
          </div>
        </aside>

        <section className="lg:col-span-9 space-y-4">
          {!loading && docsFiltrados.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Nenhum documento encontrado com os filtros atuais.</div>
          ) : null}

          {Array.from(agrupadoFiltrado.map.entries())
            .filter(([cat]) => categoriaFiltro === 'TODAS' || cat === categoriaSelecionada)
            .map(([cat, list]) => {
              const ordered = [...list].sort((a, b) => String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || '')));
              return (
                <div key={cat} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
                    <div className="font-semibold text-slate-900">Documentos da categoria: {cat}</div>
                    <div className="text-sm text-slate-600">{ordered.length} item(ns)</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-slate-700">
                        <tr>
                          <th className="px-4 py-2">Documento</th>
                          <th className="px-4 py-2">Obrigatório</th>
                          <th className="px-4 py-2">Validade</th>
                          <th className="px-4 py-2">Verificação</th>
                          <th className="px-4 py-2">Status</th>
                          <th className="px-4 py-2 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordered.map((d) => {
                          const s = statusLabel(d);
                          const pill =
                            s.kind === 'ok'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : s.kind === 'pendente'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : s.kind === 'irregular'
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : 'bg-slate-50 text-slate-700 border-slate-200';
                          return (
                            <tr key={d.id} className="border-t">
                              <td className="px-4 py-2">
                                <div className="font-medium text-slate-900">{d.tituloDocumento || `Documento #${d.id}`}</div>
                                <div className="text-xs text-slate-500">{d.descricaoDocumento || ''}</div>
                              </td>
                              <td className="px-4 py-2">
                                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">Sim</span>
                              </td>
                              <td className="px-4 py-2 text-slate-600">Não se aplica</td>
                              <td className="px-4 py-2 text-slate-600">—</td>
                              <td className="px-4 py-2">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${pill}`}>{s.label}</span>
                              </td>
                              <td className="px-4 py-2 text-right">
                                <div className="inline-flex items-center gap-2">
                                  {d.idVersaoAtual ? (
                                    <button
                                      type="button"
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                                      onClick={() => visualizar(d.idVersaoAtual as number, 'ORIGINAL', d.tituloDocumento || `Documento #${d.id}`)}
                                    >
                                      <FileText size={16} />
                                      Visualizar
                                    </button>
                                  ) : (
                                    <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400 inline-flex items-center gap-2" disabled>
                                      <FileText size={16} />
                                      Sem versão
                                    </button>
                                  )}
                                  <a
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                                    href={`/dashboard/documentos/${d.id}`}
                                  >
                                    <ExternalLink size={16} />
                                    Detalhes
                                  </a>
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

      {preview.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-5xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">{preview.name || 'Visualizador'}</div>
                <div className="text-xs text-slate-500">{preview.mime || ''}</div>
              </div>
              <div className="flex items-center gap-2">
                {preview.versaoId ? (
                  <>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => visualizar(preview.versaoId as number, 'ORIGINAL', preview.name || 'Documento')}
                    >
                      Original
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => visualizar(preview.versaoId as number, 'PDF_FINAL', preview.name || 'Documento')}
                    >
                      PDF final
                    </button>
                  </>
                ) : null}
                <button type="button" className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center" onClick={fecharPreview}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-5">
              {preview.url ? (
                preview.mime?.includes('pdf') ? (
                  <iframe className="w-full h-[70vh] rounded-lg bg-white" src={preview.url} />
                ) : preview.mime?.startsWith('image/') ? (
                  <div className="flex justify-center">
                    <img className="max-h-[70vh] w-auto rounded-lg border border-slate-200 bg-white" src={preview.url} alt={preview.name || 'Documento'} />
                  </div>
                ) : (
                  <a className="text-sm text-blue-700 underline" href={preview.url} target="_blank" rel="noreferrer">
                    Abrir documento
                  </a>
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
