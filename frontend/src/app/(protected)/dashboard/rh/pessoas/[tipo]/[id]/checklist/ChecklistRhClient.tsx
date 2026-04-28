'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { DocumentosApi } from '@/lib/modules/documentos/api';
import type { DocumentoRegistroDTO } from '@/lib/modules/documentos/types';
import { FuncionariosApi } from '@/lib/modules/funcionarios/api';
import { TerceirizadosApi } from '@/lib/modules/terceirizados/api';
import { ArrowLeft, ExternalLink, FileText, RefreshCcw, X } from 'lucide-react';

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

function breadcrumbFromReturnTo(returnTo: string | null) {
  const parsed = parseInternalPath(returnTo);
  const rt = String(returnTo || '').toLowerCase();
  const suffix = 'RH → Pessoas → Checklist de documentos';
  if (!rt) return suffix;

  if (/\/dashboard\/engenharia\/obras\/\d+/.test(rt) || rt.includes('/dashboard/engenharia/obras/cadastro')) {
    const obraNome = parsed?.searchParams?.get('obraNome');
    const contratoNumero = parsed?.searchParams?.get('contratoNumero');
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

export default function ChecklistRhClient() {
  const router = useRouter();
  const params = useParams<{ tipo: string; id: string }>();
  const sp = useSearchParams();

  const tipoPath = String(params?.tipo || '').toLowerCase();
  const idNum = Number(params?.id || 0);

  const returnTo = useMemo(() => safeInternalPath(sp.get('returnTo') || null), [sp]);
  const backHref = returnTo || '/dashboard/rh/cadastros';
  const breadcrumb = useMemo(() => breadcrumbFromReturnTo(returnTo), [returnTo]);

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nomePessoa, setNomePessoa] = useState<string>('');
  const [docs, setDocs] = useState<DocumentoRegistroDTO[]>([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('TODAS');

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
    return () => {
      try {
        if (preview.url) URL.revokeObjectURL(preview.url);
      } catch {}
    };
  }, [preview.url]);

  const agrupado = useMemo(() => groupByCategoria(docs), [docs]);

  const categorias = useMemo(() => ['TODAS', ...agrupado.cats], [agrupado.cats]);

  const docsFiltrados = useMemo(() => {
    if (categoriaFiltro === 'TODAS') return docs;
    return docs.filter((d) => String(d.categoriaDocumento || '').trim() === categoriaFiltro);
  }, [docs, categoriaFiltro]);

  const agrupadoFiltrado = useMemo(() => groupByCategoria(docsFiltrados), [docsFiltrados]);

  return (
    <div className="p-6 space-y-6 text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold text-slate-900">Checklist de documentos</h1>
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

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="text-xs text-slate-600 mb-1">Categoria (RH)</div>
            <select className="input" value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c === 'TODAS' ? 'Todas' : c}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-8 flex items-end justify-end">
            <div className="text-sm text-slate-600">
              {loading ? 'Carregando...' : `${docs.length} documento(s) RH encontrado(s)`}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {!loading && docsFiltrados.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Nenhum documento RH encontrado para esta pessoa.
          </div>
        ) : null}

        {Array.from(agrupadoFiltrado.map.entries()).map(([cat, list]) => {
          const ordered = [...list].sort((a, b) => String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || '')));
          return (
            <div key={cat} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
                <div className="font-semibold text-slate-900">{cat}</div>
                <div className="text-sm text-slate-600">{ordered.length} item(ns)</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-slate-700">
                    <tr>
                      <th className="px-4 py-2">Título</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Atualizado</th>
                      <th className="px-4 py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="px-4 py-2">
                          <div className="font-medium text-slate-900">{d.tituloDocumento || `Documento #${d.id}`}</div>
                          <div className="text-xs text-slate-500">{d.descricaoDocumento || ''}</div>
                        </td>
                        <td className="px-4 py-2">{d.statusDocumento}</td>
                        <td className="px-4 py-2">{fmtDateTime(d.atualizadoEm)}</td>
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
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
