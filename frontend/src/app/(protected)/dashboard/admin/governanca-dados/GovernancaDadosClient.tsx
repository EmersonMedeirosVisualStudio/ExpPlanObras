'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GovernancaDadosApi } from '@/lib/modules/governanca-dados/api';
import type { GovernancaAtivoDTO, GovernancaQualidadeIssueDTO, GovernancaQualidadeRegraDTO } from '@/lib/modules/governanca-dados/types';

type TabKey = 'CATALOGO' | 'QUALIDADE' | 'ISSUES' | 'PII';

function cx(...classes: Array<string | null | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

export default function GovernancaDadosClient() {
  const [tab, setTab] = useState<TabKey>('CATALOGO');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [ativos, setAtivos] = useState<GovernancaAtivoDTO[]>([]);
  const [selectedAtivoId, setSelectedAtivoId] = useState<number | null>(null);

  const selectedAtivo = useMemo(() => ativos.find((a) => a.id === selectedAtivoId) || null, [ativos, selectedAtivoId]);

  const [regras, setRegras] = useState<GovernancaQualidadeRegraDTO[]>([]);
  const [issues, setIssues] = useState<GovernancaQualidadeIssueDTO[]>([]);
  const [piiScanId, setPiiScanId] = useState<number | null>(null);
  const [piiResultados, setPiiResultados] = useState<any[]>([]);
  const [piiSugestoes, setPiiSugestoes] = useState<any[]>([]);

  const carregarAtivos = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await GovernancaDadosApi.listarAtivos({ limite: 50, pagina: 1 });
      setAtivos(rows);
      if (!selectedAtivoId && rows.length) setSelectedAtivoId(rows[0].id);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar'));
    } finally {
      setLoading(false);
    }
  }, [selectedAtivoId]);

  const carregarQualidade = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [r, i] = await Promise.all([
        GovernancaDadosApi.listarRegras(selectedAtivoId ? { ativoId: selectedAtivoId, limite: 50, pagina: 1 } : { limite: 50, pagina: 1 }),
        GovernancaDadosApi.listarIssues({ limite: 50, pagina: 1 }),
      ]);
      setRegras(r);
      setIssues(i);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar'));
    } finally {
      setLoading(false);
    }
  }, [selectedAtivoId]);

  const sincronizar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      await GovernancaDadosApi.sincronizarCatalogo();
      await carregarAtivos();
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao sincronizar'));
    } finally {
      setLoading(false);
    }
  }, [carregarAtivos]);

  const executarRegra = useCallback(
    async (id: number) => {
    setLoading(true);
    setErr(null);
    try {
      await GovernancaDadosApi.executarRegra(id);
      await carregarQualidade();
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao executar regra'));
    } finally {
      setLoading(false);
    }
    },
    [carregarQualidade]
  );

  const carregarPii = useCallback(async () => {
    if (!selectedAtivoId) return;
    setLoading(true);
    setErr(null);
    try {
      const sugestoes = await GovernancaDadosApi.listarSugestoesClassificacao({ status: 'PENDENTE', limite: 50, pagina: 1 });
      setPiiSugestoes(sugestoes);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar PII'));
    } finally {
      setLoading(false);
    }
  }, [selectedAtivoId]);

  const executarPiiScan = useCallback(async () => {
    if (!selectedAtivoId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await GovernancaDadosApi.executarPiiScan({ ativoId: selectedAtivoId, sampleSize: 20 });
      setPiiScanId(res.scanId || null);
      if (res.scanId) {
        const rows = await GovernancaDadosApi.listarPiiResultados(res.scanId);
        setPiiResultados(rows);
      } else {
        setPiiResultados([]);
      }
      const sugestoes = await GovernancaDadosApi.listarSugestoesClassificacao({ status: 'PENDENTE', limite: 50, pagina: 1 });
      setPiiSugestoes(sugestoes);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao executar scan'));
    } finally {
      setLoading(false);
    }
  }, [selectedAtivoId]);

  const aceitarSugestao = useCallback(async (id: number) => {
    setLoading(true);
    setErr(null);
    try {
      await GovernancaDadosApi.aceitarSugestaoClassificacao(id);
      await carregarPii();
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao aceitar sugestão'));
    } finally {
      setLoading(false);
    }
  }, [carregarPii]);

  const rejeitarSugestao = useCallback(async (id: number) => {
    setLoading(true);
    setErr(null);
    try {
      await GovernancaDadosApi.rejeitarSugestaoClassificacao(id, { motivo: 'REJEITADO_MANUAL' });
      await carregarPii();
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao rejeitar sugestão'));
    } finally {
      setLoading(false);
    }
  }, [carregarPii]);

  useEffect(() => {
    carregarAtivos();
  }, [carregarAtivos]);

  useEffect(() => {
    if (tab === 'QUALIDADE' || tab === 'ISSUES') carregarQualidade();
    if (tab === 'PII') carregarPii();
  }, [tab, carregarQualidade, carregarPii]);

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Governança de Dados</h1>
          <p className="text-gray-600 mt-1">Catálogo, lineage e qualidade (fase 1).</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={sincronizar} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Sincronizar catálogo
          </button>
          <button type="button" onClick={carregarAtivos} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="border-b">
        <nav className="flex gap-6">
          {([
            { key: 'CATALOGO', label: 'Catálogo' },
            { key: 'QUALIDADE', label: 'Qualidade' },
            { key: 'ISSUES', label: 'Issues' },
            { key: 'PII', label: 'PII Scan' },
          ] as Array<{ key: TabKey; label: string }>).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cx('py-3 text-sm', tab === t.key ? 'border-b-2 border-blue-600 text-blue-700 font-medium' : 'text-gray-600')}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'CATALOGO' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Ativos</div>
            <div className="max-h-[520px] overflow-auto">
              {ativos.length ? (
                <ul className="divide-y">
                  {ativos.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedAtivoId(a.id)}
                        className={cx(
                          'w-full text-left px-4 py-3 hover:bg-gray-50',
                          selectedAtivoId === a.id ? 'bg-blue-50' : ''
                        )}
                      >
                        <div className="text-sm font-medium text-gray-900">{a.nomeAtivo}</div>
                        <div className="text-xs text-gray-600">
                          {a.tipoAtivo} · {a.classificacaoGlobal} · {a.dominioNome || '-'}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-3 text-sm text-gray-500">{loading ? 'Carregando...' : 'Sem ativos.'}</div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 rounded-xl border bg-white shadow-sm p-4 space-y-3">
            <div className="text-sm font-semibold text-gray-700">Detalhe</div>
            {selectedAtivo ? (
              <div className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-gray-500">Código</div>
                    <div className="text-sm text-gray-900">{selectedAtivo.codigoAtivo}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-gray-500">Classificação</div>
                    <div className="text-sm text-gray-900">{selectedAtivo.classificacaoGlobal}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-gray-500">Owner negócio</div>
                    <div className="text-sm text-gray-900">{selectedAtivo.ownerNegocioNome || '-'}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-gray-500">Owner técnico</div>
                    <div className="text-sm text-gray-900">{selectedAtivo.ownerTecnicoNome || '-'}</div>
                  </div>
                </div>
                <div className="text-xs text-gray-500">Lineage e campos completos ficam na página de detalhe (fase 2).</div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Selecione um ativo.</div>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'QUALIDADE' ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">Regras</div>
            <div className="text-xs text-gray-500">{selectedAtivo ? `Ativo: ${selectedAtivo.nomeAtivo}` : 'Sem ativo selecionado'}</div>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Regra</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Campo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Severidade</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {regras.length ? (
                  regras.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{r.nomeRegra}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{r.tipoRegra}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{r.caminhoCampo || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{r.severidade}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" className="rounded-lg border px-3 py-1 text-sm" onClick={() => executarRegra(r.id)} disabled={loading}>
                          Executar
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-500" colSpan={5}>
                      {loading ? 'Carregando...' : 'Sem regras.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'ISSUES' ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Issues de Qualidade</div>
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Ativo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Título</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Severidade</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Última ocorrência</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {issues.length ? (
                  issues.map((it) => (
                    <tr key={it.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{it.ativoNome || it.ativoCodigo || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{it.tituloIssue}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{it.severidade}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{it.statusIssue}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{it.ultimaOcorrenciaEm}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-500" colSpan={5}>
                      {loading ? 'Carregando...' : 'Sem issues.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'PII' ? (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white shadow-sm p-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-gray-700">Detecção de PII (amostral)</div>
              <div className="text-xs text-gray-500">{selectedAtivo ? `Ativo: ${selectedAtivo.nomeAtivo}` : 'Selecione um ativo no Catálogo'}</div>
              {piiScanId ? <div className="text-xs text-gray-500">Último scan: {piiScanId}</div> : null}
            </div>
            <button type="button" className="rounded-lg border bg-white px-4 py-2 text-sm" onClick={executarPiiScan} disabled={loading || !selectedAtivoId}>
              Executar scan
            </button>
          </div>

          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Resultados</div>
            <div className="overflow-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Campo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Confiança</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Amostra mascarada</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Sugestão</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {piiResultados.length ? (
                    piiResultados.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{r.campo?.caminhoCampo || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{r.tipoDetectado}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{r.nivelConfianca}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{r.amostraMascarada || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{r.sugestaoClassificacao || '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-3 text-sm text-gray-500" colSpan={5}>
                        {loading ? 'Carregando...' : 'Sem resultados.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Sugestões pendentes</div>
            <div className="overflow-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Ativo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Campo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Classificação</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {piiSugestoes.length ? (
                    piiSugestoes.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{s.ativo?.nomeAtivo || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{s.campo?.caminhoCampo || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{s.classificacaoSugerida}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button type="button" className="rounded-lg border px-3 py-1 text-sm" onClick={() => aceitarSugestao(s.id)} disabled={loading}>
                              Aceitar
                            </button>
                            <button type="button" className="rounded-lg border px-3 py-1 text-sm" onClick={() => rejeitarSugestao(s.id)} disabled={loading}>
                              Rejeitar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-3 text-sm text-gray-500" colSpan={4}>
                        {loading ? 'Carregando...' : 'Sem sugestões.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

