'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DocumentosApi } from '@/lib/modules/documentos/api';
import type { DocumentoRegistroDTO } from '@/lib/modules/documentos/types';
import api from '@/lib/api';

type ContratoOption = { id: number; numeroContrato: string; objeto: string | null };

export default function ObrasDocumentosPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialTipo = (sp.get('tipo') || 'OBRA').toUpperCase();
  const initialId = sp.get('id') || '';

  const [tipo, setTipo] = useState<'OBRA' | 'CONTRATO'>(initialTipo === 'CONTRATO' ? 'CONTRATO' : 'OBRA');
  const [idRef, setIdRef] = useState(initialId);
  const [categoriaPrefix, setCategoriaPrefix] = useState(tipo === 'OBRA' ? 'OBRA:' : 'CONTRATO:');
  const [incluirObras, setIncluirObras] = useState(true);
  const [contratos, setContratos] = useState<ContratoOption[]>([]);
  const [contratoBusca, setContratoBusca] = useState('');
  const [contratoOpen, setContratoOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rows, setRows] = useState<DocumentoRegistroDTO[]>([]);

  const categoriasSugeridas = useMemo(() => {
    if (tipo === 'OBRA') {
      return ['OBRA:ART', 'OBRA:PROJETO', 'OBRA:REVISAO_PROJETO', 'OBRA:LAUDO', 'OBRA:PARECER', 'OBRA:RELATORIO', 'OBRA:OUTROS'];
    }
    return ['CONTRATO:CONTRATO', 'CONTRATO:OS', 'CONTRATO:ADITIVO', 'CONTRATO:MEDICAO', 'CONTRATO:COMUNICACAO', 'CONTRATO:OUTROS'];
  }, [tipo]);

  const grouped = useMemo(() => {
    const map = new Map<string, DocumentoRegistroDTO[]>();
    for (const r of rows) {
      const cat = String(r.categoriaDocumento || 'SEM_CATEGORIA');
      const parts = cat.split(':').map((p) => p.trim()).filter(Boolean);
      const key = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0] || cat;
      map.set(key, [...(map.get(key) || []), r]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

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

  async function carregar() {
    const id = Number(idRef || 0);
    if (!id) return;
    try {
      setLoading(true);
      setErro(null);
      router.replace(`/dashboard/obras/documentos?tipo=${tipo}&id=${id}`);
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
  }

  async function criarDocumento() {
    const id = Number(idRef || 0);
    if (!id) return;
    const cat = (prompt('Categoria (use padrão TIPO:SUBTIPO, ex.: OBRA:ART):', categoriaPrefix || '') || '').trim().toUpperCase();
    if (!cat) return;
    const titulo = (prompt('Título:') || '').trim();
    if (!titulo) return;
    try {
      setLoading(true);
      setErro(null);
      const res = await DocumentosApi.criar({
        categoriaDocumento: cat,
        tituloDocumento: titulo,
        entidadeTipo: tipo,
        entidadeId: id,
      });
      router.push(`/dashboard/documentos/${res.id}`);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao criar documento.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-7xl space-y-6 text-[#111827]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Documentos</h1>
          <div className="mt-1 text-sm text-[#6B7280]">
            Organização por tipo/subtipo (categoria) e vínculo com obra/contrato. Contratos podem visualizar também os documentos das obras vinculadas.
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]" type="button" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
          <button className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8]" type="button" onClick={criarDocumento} disabled={loading}>
            Novo documento
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-[#6B7280]">Contexto</div>
            <select
              className="input"
              value={tipo}
              onChange={(e) => {
                const v = e.target.value === 'CONTRATO' ? 'CONTRATO' : 'OBRA';
                setTipo(v);
                setCategoriaPrefix(v === 'OBRA' ? 'OBRA:' : 'CONTRATO:');
                setRows([]);
              }}
            >
              <option value="OBRA">Obra</option>
              <option value="CONTRATO">Contrato</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-[#6B7280]">ID</div>
            {tipo === 'OBRA' ? (
              <input className="input" value={idRef} onChange={(e) => setIdRef(e.target.value)} placeholder="idObra" />
            ) : (
              <div className="relative">
                <input
                  className="input"
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
                />
                {contratoOpen ? (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
                    <div className="max-h-64 overflow-auto">
                      {contratosFiltrados.map((c) => {
                        const label = `#${c.id} - ${c.numeroContrato || '—'} - ${c.objeto || '—'}`;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-[#111827] hover:bg-[#F9FAFB]"
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
                      {!contratosFiltrados.length ? (
                        <div className="px-3 py-2 text-sm text-[#6B7280]">Nenhum contrato encontrado.</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-[#6B7280]">Categoria prefixo</div>
            <input className="input" value={categoriaPrefix} onChange={(e) => setCategoriaPrefix(e.target.value.toUpperCase())} placeholder="Ex.: OBRA:" />
          </div>
          <div className="md:col-span-2 flex items-end gap-3">
            {tipo === 'CONTRATO' ? (
              <label className="flex items-center gap-2 text-sm text-[#111827]">
                <input type="checkbox" checked={incluirObras} onChange={(e) => setIncluirObras(e.target.checked)} />
                Incluir documentos das obras do contrato
              </label>
            ) : (
              <div className="text-sm text-[#6B7280]">Dica: use categorias como OBRA:ART, OBRA:PROJETO, OBRA:LAUDO.</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {categoriasSugeridas.map((c) => (
            <button key={c} type="button" className="rounded-full border border-[#D1D5DB] bg-white px-3 py-1 text-xs text-[#111827] hover:bg-[#F9FAFB]" onClick={() => setCategoriaPrefix(`${c.split(':')[0]}:${c.split(':')[1]}:`.replace('::', ':'))}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {grouped.map(([cat, items]) => (
          <div key={cat} className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-lg font-semibold">{cat}</div>
              <div className="text-sm text-[#6B7280]">{items.length} documento(s)</div>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#F9FAFB] text-left text-[#111827]">
                  <tr>
                    <th className="px-3 py-2">Título</th>
                    <th className="px-3 py-2">Vínculo</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-t border-[#E5E7EB]">
                      <td className="px-3 py-2">
                        <div className="font-medium text-[#111827]">{r.tituloDocumento}</div>
                        <div className="text-xs text-[#6B7280]">#{r.id}</div>
                        {r.descricaoDocumento ? <div className="mt-1 text-xs text-[#6B7280]">{r.descricaoDocumento}</div> : null}
                      </td>
                      <td className="px-3 py-2 text-[#6B7280]">{r.entidadeTipo && r.entidadeId ? `${r.entidadeTipo}:${r.entidadeId}` : '-'}</td>
                      <td className="px-3 py-2">{r.statusDocumento}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-sm text-[#111827] hover:bg-[#F9FAFB]" onClick={() => router.push(`/dashboard/documentos/${r.id}`)}>
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!items.length ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-[#6B7280]" colSpan={4}>
                        Sem documentos.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {!grouped.length ? (
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 text-sm text-[#6B7280]">
            Informe o contexto e o ID e clique em “Atualizar” para listar os documentos.
          </div>
        ) : null}
      </div>
    </div>
  );
}
