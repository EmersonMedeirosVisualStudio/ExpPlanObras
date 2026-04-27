'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DocumentosApi } from '@/lib/modules/documentos/api';
import type { DocumentoRegistroDTO } from '@/lib/modules/documentos/types';
import api from '@/lib/api';
import { ArrowLeft, ExternalLink, FileText, Info, RefreshCcw, Search, Upload, X } from 'lucide-react';

type ContratoOption = { id: number; numeroContrato: string; objeto: string | null };

function safeInternalPath(v: string | null) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (!s.startsWith('/')) return null;
  if (s.startsWith('//')) return null;
  return s;
}

export default function ObrasDocumentosPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialTipo = (sp.get('tipo') || 'OBRA').toUpperCase();
  const initialId = sp.get('id') || '';
  const initialCategoria = (sp.get('categoriaPrefix') || '').trim().toUpperCase();
  const returnTo = safeInternalPath(sp.get('returnTo') || sp.get('from'));
  const lockObraContext = initialTipo === 'OBRA' && Boolean(initialId);

  const [tipo, setTipo] = useState<'OBRA' | 'CONTRATO'>(initialTipo === 'CONTRATO' ? 'CONTRATO' : 'OBRA');
  const [idRef, setIdRef] = useState(initialId);
  const [categoriaPrefix, setCategoriaPrefix] = useState(() => {
    const defaultPrefix = initialTipo === 'CONTRATO' ? 'CONTRATO:' : 'OBRA:';
    return initialCategoria && initialCategoria.startsWith(defaultPrefix) ? initialCategoria : defaultPrefix;
  });
  const [incluirObras, setIncluirObras] = useState(true);
  const [contratos, setContratos] = useState<ContratoOption[]>([]);
  const [contratoBusca, setContratoBusca] = useState('');
  const [contratoOpen, setContratoOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rows, setRows] = useState<DocumentoRegistroDTO[]>([]);

  const [novoCategoria, setNovoCategoria] = useState(() => (initialCategoria ? initialCategoria : initialTipo === 'CONTRATO' ? 'CONTRATO:' : 'OBRA:'));
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoDescricao, setNovoDescricao] = useState('');
  const [novoArquivo, setNovoArquivo] = useState<File | null>(null);
  const [busca, setBusca] = useState('');

  const novoArquivoInputRef = useRef<HTMLInputElement | null>(null);

  const categoriasSugeridas = useMemo(() => {
    if (tipo === 'OBRA') {
      return ['OBRA:ART', 'OBRA:PROJETO', 'OBRA:REVISAO_PROJETO', 'OBRA:LAUDO', 'OBRA:PARECER', 'OBRA:RELATORIO', 'OBRA:OUTROS'];
    }
    return ['CONTRATO:CONTRATO', 'CONTRATO:OS', 'CONTRATO:ADITIVO', 'CONTRATO:MEDICAO', 'CONTRATO:COMUNICACAO', 'CONTRATO:OUTROS'];
  }, [tipo]);

  const displayedRows = useMemo(() => {
    const term = String(busca || '').trim().toLowerCase();
    const list = rows.slice().sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
    if (!term) return list;
    return list.filter((r) => {
      const hay = `${r.id} ${r.categoriaDocumento} ${r.tituloDocumento} ${r.descricaoDocumento || ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [rows, busca]);

  const pageTitle = useMemo(() => (tipo === 'OBRA' ? 'Documentos da Obra' : 'Documentos do Contrato'), [tipo]);

  function limparCampos(nextTipo?: 'OBRA' | 'CONTRATO') {
    const t = nextTipo || tipo;
    setNovoCategoria(t === 'CONTRATO' ? 'CONTRATO:' : 'OBRA:');
    setNovoTitulo('');
    setNovoDescricao('');
    setNovoArquivo(null);
    if (novoArquivoInputRef.current) novoArquivoInputRef.current.value = '';
  }

  function badgeClassForCategoria(cat: string) {
    const up = String(cat || '').toUpperCase();
    if (up.includes(':ART')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (up.includes(':PROJETO')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (up.includes(':LAUDO')) return 'bg-amber-50 text-amber-800 border-amber-200';
    if (up.includes(':RELATORIO')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    return 'bg-slate-50 text-slate-700 border-slate-200';
  }

  useEffect(() => {
    let active = true;
    async function carregarContratos() {
      try {
        const res = await api.get('/api/contratos');
        const list = (res.data as any[]) || [];
        const mapped: ContratoOption[] = list
          .map((x: any) => ({
            id: Number(x.id),
            numeroContrato: String(x.numeroContrato || ''),
            objeto: x.objeto ?? null,
          }))
          .filter((x) => Number.isFinite(x.id) && x.id > 0);
        if (active) setContratos(mapped);
      } catch {
        if (active) setContratos([]);
      }
    }
    if (tipo === 'CONTRATO') carregarContratos();
    return () => {
      active = false;
    };
  }, [tipo]);

  const carregar = useCallback(async () => {
    const id = Number(idRef || 0);
    if (!id) return;
    try {
      setLoading(true);
      setErro(null);
      const qp = new URLSearchParams();
      qp.set('tipo', tipo);
      qp.set('id', String(id));
      if (categoriaPrefix) qp.set('categoriaPrefix', categoriaPrefix);
      if (returnTo) qp.set('returnTo', returnTo);
      router.replace(`/dashboard/obras/documentos?${qp.toString()}`);
      const data = await DocumentosApi.listar({
        limit: 200,
        entidadeTipo: tipo,
        entidadeId: id,
        categoriaPrefix: categoriaPrefix || null,
        incluirObrasDoContrato: tipo === 'CONTRATO' ? incluirObras : false,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar documentos.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [categoriaPrefix, idRef, incluirObras, returnTo, router, tipo]);

  useEffect(() => {
    if (!lockObraContext) return;
    const id = Number(idRef || 0);
    if (!id) return;
    carregar();
  }, [carregar, idRef, lockObraContext]);

  useEffect(() => {
    if (tipo !== 'CONTRATO') return;
    const id = Number(idRef || 0);
    if (!id) return;
    const found = contratos.find((c) => c.id === id);
    if (!found) return;
    setContratoBusca(`#${found.id} - ${found.numeroContrato || '—'} - ${found.objeto || '—'}`);
  }, [tipo, idRef, contratos]);

  const contratosFiltrados = useMemo(() => {
    const q = contratoBusca.trim().toLowerCase();
    if (!q) return contratos.slice(0, 10);
    return contratos
      .filter((c) => {
        const label = `#${c.id} ${c.numeroContrato || ''} ${c.objeto || ''}`.toLowerCase();
        return label.includes(q);
      })
      .slice(0, 10);
  }, [contratos, contratoBusca]);

  async function criarDocumento() {
    const id = Number(idRef || 0);
    if (!id) return;
    try {
      setLoading(true);
      setErro(null);
      const categoriaDocumento = String(novoCategoria || categoriaPrefix || '').trim().toUpperCase();
      const tituloDocumento = String(novoTitulo || '').trim();
      const descricaoDocumento = String(novoDescricao || '').trim();
      if (!categoriaDocumento) throw new Error('Categoria obrigatória.');
      if (!tituloDocumento) throw new Error('Título obrigatório.');

      const res = await DocumentosApi.criar({
        categoriaDocumento,
        tituloDocumento,
        descricaoDocumento: descricaoDocumento ? descricaoDocumento : null,
        entidadeTipo: tipo,
        entidadeId: id,
      });
      if (novoArquivo) {
        await DocumentosApi.criarVersaoUpload(res.id, novoArquivo);
      }
      setNovoTitulo('');
      setNovoDescricao('');
      setNovoArquivo(null);
      await carregar();
      router.push(`/dashboard/documentos/${res.id}`);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao criar documento.');
    } finally {
      setLoading(false);
    }
  }

  const breadcrumb = useMemo(() => {
    if (tipo === 'OBRA') return 'Engenharia → Obras → Obra selecionada → Documentos';
    return 'Contratos → Documentos';
  }, [tipo]);

  return (
    <div className="p-6 space-y-6 bg-[#f7f8fa] text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">{breadcrumb}</div>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700">
                <FileText className="h-4 w-4" />
              </span>
              <h1 className="text-2xl font-semibold">{pageTitle}</h1>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
              <Info className="h-3.5 w-3.5" />
              Campos obrigatórios marcados com *
            </span>
          </div>
          <div className="mt-1 text-sm text-slate-600">Gerencie e organize os documentos de forma rápida e segura.</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {returnTo ? (
            <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50 inline-flex items-center gap-2" type="button" onClick={() => router.push(returnTo)}>
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          ) : null}
          {tipo === 'OBRA' && Number(idRef || 0) > 0 ? (
            <button
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50 inline-flex items-center gap-2"
              type="button"
              onClick={() => router.push(`/dashboard/engenharia/obras/cadastro?obraId=${Number(idRef || 0)}`)}
            >
              <ExternalLink className="h-4 w-4" />
              Ver detalhes da obra
            </button>
          ) : null}
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <div className="md:col-span-9 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-blue-700" />
                  <div className="text-sm font-semibold">Inserir documento</div>
                </div>
                <div className="mt-1 text-xs text-slate-600">Preencha os campos abaixo para criar um novo documento.</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="md:col-span-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">1</span>
                    <div className="text-sm font-semibold">Contexto do documento</div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-600">Contexto *</div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm inline-flex items-center justify-center gap-2 ${
                          tipo === 'OBRA' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                        onClick={() => {
                          if (lockObraContext) return;
                          setTipo('OBRA');
                          setCategoriaPrefix('OBRA:');
                          setRows([]);
                          limparCampos('OBRA');
                        }}
                        disabled={lockObraContext}
                      >
                        Obra
                      </button>
                      <button
                        type="button"
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm inline-flex items-center justify-center gap-2 ${
                          tipo === 'CONTRATO' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                        onClick={() => {
                          if (lockObraContext) return;
                          setTipo('CONTRATO');
                          setCategoriaPrefix('CONTRATO:');
                          setRows([]);
                          limparCampos('CONTRATO');
                        }}
                        disabled={lockObraContext}
                      >
                        Contrato
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-600">{tipo === 'OBRA' ? 'ID da Obra *' : 'ID do Contrato *'}</div>
                    {tipo === 'OBRA' ? (
                      <input className="input bg-white" value={idRef} onChange={(e) => setIdRef(e.target.value)} placeholder="Ex.: 1250" disabled={lockObraContext} />
                    ) : (
                      <div className="relative">
                        <input
                          className="input bg-white"
                          value={contratoBusca}
                          onChange={(e) => {
                            const v = e.target.value;
                            setContratoBusca(v);
                            setContratoOpen(true);
                            const onlyId = v.trim().match(/^#?(\d+)\b/);
                            if (onlyId?.[1]) setIdRef(onlyId[1]);
                          }}
                          onFocus={() => setContratoOpen(true)}
                          onBlur={() => window.setTimeout(() => setContratoOpen(false), 120)}
                          placeholder="#id - Nº do contrato - Objeto"
                          disabled={lockObraContext}
                        />
                        {contratoOpen ? (
                          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                            <div className="max-h-64 overflow-auto">
                              {contratosFiltrados.map((c) => {
                                const label = `#${c.id} - ${c.numeroContrato || '—'} - ${c.objeto || '—'}`;
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      setIdRef(String(c.id));
                                      setContratoBusca(label);
                                      setContratoOpen(false);
                                      setRows([]);
                                    }}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                              {!contratosFiltrados.length ? <div className="px-3 py-2 text-sm text-slate-500">Nenhum contrato encontrado.</div> : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-xs text-slate-600">Arquivo (opcional)</div>
                    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
                      <input
                        ref={novoArquivoInputRef}
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        disabled={loading}
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          setNovoArquivo(f);
                        }}
                      />
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="text-sm text-slate-700">PDF ou imagens</div>
                          <div className="text-xs text-slate-500 truncate">{novoArquivo ? novoArquivo.name : 'Nenhum arquivo selecionado'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {novoArquivo ? (
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 inline-flex items-center gap-2"
                              onClick={() => {
                                setNovoArquivo(null);
                                if (novoArquivoInputRef.current) novoArquivoInputRef.current.value = '';
                              }}
                              disabled={loading}
                            >
                              <X className="h-4 w-4" />
                              Remover
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 inline-flex items-center gap-2"
                            onClick={() => novoArquivoInputRef.current?.click()}
                            disabled={loading}
                          >
                            <Upload className="h-4 w-4" />
                            Escolher arquivo
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">2</span>
                    <div className="text-sm font-semibold">Dados do documento</div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-600">Categoria *</div>
                    </div>
                    <input className="input bg-white" value={novoCategoria} onChange={(e) => setNovoCategoria(e.target.value.toUpperCase())} placeholder="Ex.: OBRA:ART" disabled={loading} />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {categoriasSugeridas.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          onClick={() => setNovoCategoria(c)}
                          disabled={loading}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-600">Título *</div>
                    <input className="input bg-white" value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Ex.: ART do Responsável Técnico — João Silva" disabled={loading} />
                  </div>

                  <div>
                    <div className="text-xs text-slate-600">Descrição (opcional)</div>
                    <input className="input bg-white" value={novoDescricao} onChange={(e) => setNovoDescricao(e.target.value)} placeholder="Ex.: ART nº 123456 — emitida em 10/04" disabled={loading} />
                  </div>

                  <div className="flex items-center justify-end gap-2 flex-wrap pt-1">
                    <button
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50 inline-flex items-center gap-2"
                      type="button"
                      onClick={() => limparCampos()}
                      disabled={loading}
                    >
                      <X className="h-4 w-4" />
                      Limpar campos
                    </button>
                    <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-50 inline-flex items-center gap-2" type="button" onClick={criarDocumento} disabled={loading}>
                      <FileText className="h-4 w-4" />
                      Inserir documento
                    </button>
                  </div>
                </div>

                <div className="md:col-span-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-sm font-semibold text-slate-900">Sobre os campos</div>
                    <div className="mt-3 space-y-3 text-xs text-slate-600">
                      <div className="flex gap-2">
                        <div className="mt-0.5 h-5 w-5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center justify-center">
                          <Info className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-700">Categoria</div>
                          <div>Define o tipo do documento e a organização na listagem.</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="mt-0.5 h-5 w-5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center justify-center">
                          <FileText className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-700">Título</div>
                          <div>Nome claro para fácil identificação.</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="mt-0.5 h-5 w-5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center justify-center">
                          <Upload className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-700">Arquivo</div>
                          <div>Ao anexar, ele vira a primeira versão do documento.</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="mt-0.5 h-5 w-5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center justify-center">
                          <Search className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-700">Descrição</div>
                          <div>Informações complementares (número, validade, observações).</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="text-sm font-semibold">Documentos cadastrados</div>
                <div className="text-xs text-slate-600">{displayedRows.length} documento(s)</div>
              </div>
              <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50 inline-flex items-center gap-2" type="button" onClick={carregar} disabled={loading}>
                <RefreshCcw className="h-4 w-4" />
                Atualizar lista
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-2">
                <div className="text-xs text-slate-600">Categoria prefixo</div>
                <input className="input bg-white" value={categoriaPrefix} onChange={(e) => setCategoriaPrefix(e.target.value.toUpperCase())} placeholder="Ex.: OBRA:" />
              </div>
              <div className="md:col-span-6">
                <div className="text-xs text-slate-600">Buscar documento</div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input className="input bg-white pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título, descrição, categoria ou número" />
                </div>
              </div>
              <div className="md:col-span-4 flex items-end">
                {tipo === 'CONTRATO' ? (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={incluirObras} onChange={(e) => setIncluirObras(e.target.checked)} />
                    Incluir obras do contrato
                  </label>
                ) : (
                  <div className="text-sm text-slate-600">Dica: use categorias padronizadas para relatórios e auditoria.</div>
                )}
              </div>
            </div>

            <div className="overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2">Título</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2">Versão</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        Carregando...
                      </td>
                    </tr>
                  ) : displayedRows.length ? (
                    displayedRows.map((r: DocumentoRegistroDTO) => (
                      <tr key={r.id} className="border-t border-slate-200 hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badgeClassForCategoria(r.categoriaDocumento)}`}>{r.categoriaDocumento}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{r.tituloDocumento}</div>
                          <div className="text-xs text-slate-500">#{r.id}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{r.descricaoDocumento || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{r.idVersaoAtual ? `#${r.idVersaoAtual}` : '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{r.criadoEm ? new Date(r.criadoEm).toLocaleDateString('pt-BR') : '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                            onClick={() => router.push(`/dashboard/documentos/${r.id}`)}
                          >
                            Abrir
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                        Informe o contexto e o ID e clique em “Atualizar lista”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="md:col-span-3 space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-sm font-semibold text-emerald-900">Como usar</div>
            <div className="mt-1 text-xs text-emerald-900/80">Passo a passo rápido</div>
            <ol className="mt-3 space-y-3 text-xs text-emerald-900">
              <li className="flex gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px] font-semibold">1</span>
                <div>Acesse Engenharia → Obras, selecione a obra e clique em Documentos.</div>
              </li>
              <li className="flex gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px] font-semibold">2</span>
                <div>Preencha contexto, categoria e título.</div>
              </li>
              <li className="flex gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px] font-semibold">3</span>
                <div>Anexe o arquivo (opcional).</div>
              </li>
              <li className="flex gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px] font-semibold">4</span>
                <div>Clique em Inserir documento.</div>
              </li>
              <li className="flex gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px] font-semibold">5</span>
                <div>Valide na listagem e no detalhe do documento.</div>
              </li>
            </ol>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm font-semibold text-amber-900">Boas práticas</div>
            <ul className="mt-3 space-y-2 text-xs text-amber-900">
              <li>Use categorias padronizadas (ex.: OBRA:ART, OBRA:PROJETO).</li>
              <li>Escreva títulos descritivos (quem/qual/qual versão).</li>
              <li>Preencha descrição com números e datas importantes.</li>
              <li>Anexe o arquivo sempre que possível para rastreabilidade.</li>
            </ul>
          </div>
        </aside>
      </div>
      </div>
    </div>
  );
}
