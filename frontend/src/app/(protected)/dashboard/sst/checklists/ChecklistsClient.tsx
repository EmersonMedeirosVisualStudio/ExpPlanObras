'use client';

import { useEffect, useMemo, useState } from 'react';
import { SstApi } from '@/lib/modules/sst/api';
import type { SstChecklistExecucaoDTO, SstChecklistExecucaoDetalheDTO, SstChecklistModeloDTO } from '@/lib/modules/sst/types';

export default function ChecklistsClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modelos, setModelos] = useState<SstChecklistModeloDTO[]>([]);
  const [execucoes, setExecucoes] = useState<SstChecklistExecucaoDTO[]>([]);
  const [selectedExecucaoId, setSelectedExecucaoId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SstChecklistExecucaoDetalheDTO | null>(null);

  const selectedResumo = useMemo(() => execucoes.find((e) => e.id === selectedExecucaoId) || null, [execucoes, selectedExecucaoId]);

  async function carregar() {
    try {
      setLoading(true);
      setError(null);
      const [ms, es] = await Promise.all([SstApi.listarModelos(), SstApi.listarExecucoes()]);
      setModelos(Array.isArray(ms) ? ms : []);
      setExecucoes(Array.isArray(es) ? es : []);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar checklists.');
    } finally {
      setLoading(false);
    }
  }

  async function abrirExecucao(id: number) {
    try {
      setError(null);
      const d = await SstApi.obterExecucao(id);
      setDetail(d);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar execução.');
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    if (selectedExecucaoId) abrirExecucao(selectedExecucaoId);
  }, [selectedExecucaoId]);

  async function novoModelo() {
    const nomeModelo = (prompt('Nome do modelo:') || '').trim();
    if (!nomeModelo) return;
    const periodicidade = (prompt('Periodicidade (DIARIO/SEMANAL/MENSAL/PONTUAL):') || '').trim().toUpperCase();
    if (!periodicidade) return;
    const tipoLocalPermitido = (prompt('Tipo local permitido (OBRA/UNIDADE/AMBOS):') || 'AMBOS').trim().toUpperCase();

    try {
      setError(null);
      await SstApi.criarModelo({ nomeModelo, periodicidade, tipoLocalPermitido, abrangeTerceirizados: true, exigeAssinaturaExecutor: true, exigeCienciaResponsavel: false });
      await carregar();
    } catch (e: any) {
      setError(e?.message || 'Erro ao criar modelo.');
    }
  }

  async function novaExecucao() {
    const idModeloChecklist = Number(prompt('ID do modelo:') || '');
    if (!Number.isFinite(idModeloChecklist)) return;
    const tipoLocal = (prompt('Tipo local (OBRA/UNIDADE):') || '').trim().toUpperCase();
    if (!tipoLocal) return;
    const idRef = Number(prompt(`ID da ${tipoLocal === 'OBRA' ? 'obra' : 'unidade'}:`) || '');
    if (!Number.isFinite(idRef)) return;
    const dataReferencia = (prompt('Data referência (YYYY-MM-DD):') || new Date().toISOString().slice(0, 10)).trim();

    try {
      setError(null);
      const payload: any = { idModeloChecklist, tipoLocal, dataReferencia, idObra: tipoLocal === 'OBRA' ? idRef : null, idUnidade: tipoLocal === 'UNIDADE' ? idRef : null };
      const res = await SstApi.criarExecucao(payload);
      await carregar();
      setSelectedExecucaoId(res.id);
    } catch (e: any) {
      setError(e?.message || 'Erro ao criar execução.');
    }
  }

  async function marcar(idModeloItem: number, conformeFlag: number | null) {
    if (!detail) return;
    setDetail((prev) => {
      if (!prev) return prev;
      return { ...prev, itens: prev.itens.map((i) => (i.idModeloItem === idModeloItem ? { ...i, conformeFlag, geraNc: conformeFlag === 0 } : i)) };
    });
  }

  async function salvar() {
    if (!detail) return;
    try {
      setError(null);
      await SstApi.salvarItensExecucao(detail.id, {
        itens: detail.itens.map((i) => ({
          idModeloItem: i.idModeloItem,
          respostaValor: i.respostaValor,
          conformeFlag: i.conformeFlag,
          observacao: i.observacao,
          geraNc: i.geraNc,
        })),
      });
      await abrirExecucao(detail.id);
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar itens.');
    }
  }

  async function finalizar() {
    if (!detail) return;
    try {
      setError(null);
      await SstApi.finalizarExecucao(detail.id, { tipoAssinatura: 'ASSINATURA_TELA' });
      await carregar();
      await abrirExecucao(detail.id);
    } catch (e: any) {
      setError(e?.message || 'Erro ao finalizar.');
    }
  }

  if (loading) return <div className="rounded-xl border bg-white p-6">Carregando checklists...</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Checklists SST</h1>
          <p className="text-sm text-slate-600">Modelos, execução por obra/unidade e finalização.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={novoModelo} className="rounded-lg border px-4 py-2 text-sm" type="button">
            Novo modelo
          </button>
          <button onClick={novaExecucao} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" type="button">
            Nova execução
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-1">
          <h2 className="mb-3 text-lg font-semibold">Execuções</h2>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Modelo</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {execucoes.map((e) => (
                  <tr
                    key={e.id}
                    className={`border-t cursor-pointer ${selectedExecucaoId === e.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                    onClick={() => setSelectedExecucaoId(e.id)}
                  >
                    <td className="px-3 py-2">{e.dataReferencia}</td>
                    <td className="px-3 py-2">{e.nomeModelo}</td>
                    <td className="px-3 py-2">{e.statusExecucao}</td>
                  </tr>
                ))}
                {execucoes.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                      Nenhuma execução.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">Detalhe</h2>
            {detail && (
              <div className="flex gap-2 flex-wrap">
                <button className="rounded-lg border px-3 py-2 text-xs" type="button" onClick={salvar} disabled={detail.statusExecucao !== 'EM_PREENCHIMENTO'}>
                  Salvar
                </button>
                <button className="rounded-lg border px-3 py-2 text-xs" type="button" onClick={finalizar} disabled={detail.statusExecucao !== 'EM_PREENCHIMENTO'}>
                  Finalizar
                </button>
              </div>
            )}
          </div>

          {!selectedResumo || !detail ? (
            <div className="text-sm text-slate-500">Selecione uma execução.</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                <div>
                  <span className="text-slate-500">Modelo:</span> {detail.nomeModelo}
                </div>
                <div className="mt-1 text-slate-600">
                  {detail.tipoLocal} {detail.idObra || detail.idUnidade || ''} • {detail.dataReferencia} • {detail.statusExecucao}
                </div>
              </div>

              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Resposta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.itens.map((i) => (
                      <tr key={i.idModeloItem} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium">{i.descricaoItem}</div>
                          {i.grupoItem ? <div className="text-xs text-slate-500">{i.grupoItem}</div> : null}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2 flex-wrap">
                            <button className="rounded border px-2 py-1 text-xs" type="button" onClick={() => marcar(i.idModeloItem, 1)} disabled={detail.statusExecucao !== 'EM_PREENCHIMENTO'}>
                              OK
                            </button>
                            <button className="rounded border px-2 py-1 text-xs" type="button" onClick={() => marcar(i.idModeloItem, 0)} disabled={detail.statusExecucao !== 'EM_PREENCHIMENTO'}>
                              NOK
                            </button>
                            <button className="rounded border px-2 py-1 text-xs" type="button" onClick={() => marcar(i.idModeloItem, null)} disabled={detail.statusExecucao !== 'EM_PREENCHIMENTO'}>
                              N/A
                            </button>
                            <span className="text-xs text-slate-600">
                              {i.conformeFlag === 1 ? 'Conforme' : i.conformeFlag === 0 ? 'Não conforme' : i.conformeFlag === null ? 'N/A' : '—'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {detail.itens.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-6 text-center text-slate-500">
                          Modelo sem itens.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Modelos</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Periodicidade</th>
                <th className="px-3 py-2">Local</th>
                <th className="px-3 py-2">Ativo</th>
              </tr>
            </thead>
            <tbody>
              {modelos.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-3 py-2">{m.id}</td>
                  <td className="px-3 py-2">{m.nomeModelo}</td>
                  <td className="px-3 py-2">{m.periodicidade}</td>
                  <td className="px-3 py-2">{m.tipoLocalPermitido}</td>
                  <td className="px-3 py-2">{m.ativo ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
              {modelos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Nenhum modelo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

