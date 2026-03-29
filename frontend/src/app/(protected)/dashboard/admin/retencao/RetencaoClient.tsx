'use client';

import { useCallback, useEffect, useState } from 'react';
import { RetencaoApi } from '@/lib/modules/retencao/api';
import type { DescarteLoteDTO, LegalHoldDTO, RetencaoItemDTO, RetencaoPoliticaDTO } from '@/lib/modules/retencao/types';

type TabKey = 'POLITICAS' | 'INVENTARIO' | 'HOLDS' | 'LOTES' | 'AUDITORIA';

function cx(...classes: Array<string | null | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

export default function RetencaoClient() {
  const [tab, setTab] = useState<TabKey>('INVENTARIO');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [politicas, setPoliticas] = useState<RetencaoPoliticaDTO[]>([]);
  const [inventario, setInventario] = useState<RetencaoItemDTO[]>([]);
  const [holds, setHolds] = useState<LegalHoldDTO[]>([]);
  const [lotes, setLotes] = useState<DescarteLoteDTO[]>([]);
  const [auditoria, setAuditoria] = useState<any[]>([]);

  const carregarPoliticas = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await RetencaoApi.listarPoliticas({ limite: 50, pagina: 1 });
      setPoliticas(rows);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar políticas'));
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarInventario = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await RetencaoApi.listarInventario({ limite: 50, pagina: 1 });
      setInventario(rows);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar inventário'));
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarHolds = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await RetencaoApi.listarHolds();
      setHolds(rows);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar holds'));
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarLotes = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await RetencaoApi.listarLotes();
      setLotes(rows);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar lotes'));
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarAuditoria = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await RetencaoApi.listarAuditoria({ limite: 50, pagina: 1 });
      setAuditoria(rows);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar auditoria'));
    } finally {
      setLoading(false);
    }
  }, []);

  const sincronizarInventario = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      await RetencaoApi.sincronizarInventario({ limite: 500 });
      await carregarInventario();
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao sincronizar inventário'));
    } finally {
      setLoading(false);
    }
  }, [carregarInventario]);

  const criarLoteSimulacao = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      await RetencaoApi.criarLote({ nomeLote: 'Simulação', tipoExecucao: 'SIMULACAO' });
      await carregarLotes();
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao criar lote'));
    } finally {
      setLoading(false);
    }
  }, [carregarLotes]);

  useEffect(() => {
    carregarInventario();
  }, [carregarInventario]);

  useEffect(() => {
    if (tab === 'POLITICAS') carregarPoliticas();
    if (tab === 'INVENTARIO') carregarInventario();
    if (tab === 'HOLDS') carregarHolds();
    if (tab === 'LOTES') carregarLotes();
    if (tab === 'AUDITORIA') carregarAuditoria();
  }, [tab, carregarPoliticas, carregarInventario, carregarHolds, carregarLotes, carregarAuditoria]);

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Retenção e Legal Hold</h1>
          <p className="text-gray-600 mt-1">Políticas, inventário, holds e descarte controlado (fase 1).</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={sincronizarInventario} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Sincronizar inventário
          </button>
          <button type="button" onClick={criarLoteSimulacao} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Criar lote (simulação)
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="border-b">
        <nav className="flex gap-6">
          {([
            { key: 'INVENTARIO', label: 'Inventário' },
            { key: 'POLITICAS', label: 'Políticas' },
            { key: 'HOLDS', label: 'Legal Holds' },
            { key: 'LOTES', label: 'Lotes' },
            { key: 'AUDITORIA', label: 'Auditoria' },
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

      {tab === 'INVENTARIO' ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Itens</div>
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Recurso</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Entidade</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Elegível</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Hold</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inventario.length ? (
                  inventario.map((it) => (
                    <tr key={it.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{it.recurso}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{it.entidadeId}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{it.statusRetencao}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{it.elegivelDescarteEm || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{it.holdAtivo ? `Sim (${it.totalHoldsAtivos})` : 'Não'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-500" colSpan={5}>
                      {loading ? 'Carregando...' : 'Sem itens.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'POLITICAS' ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Políticas</div>
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Recurso</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Evento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Período</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {politicas.length ? (
                  politicas.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{p.codigoPolitica}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{p.recurso}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{p.eventoBase}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {p.periodoValor} {p.periodoUnidade}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{p.acaoFinal}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-500" colSpan={5}>
                      {loading ? 'Carregando...' : 'Sem políticas.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'HOLDS' ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Legal Holds</div>
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Título</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {holds.length ? (
                  holds.map((h) => (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{h.codigoHold}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{h.tituloHold}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{h.tipoHold}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{h.statusHold}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-500" colSpan={4}>
                      {loading ? 'Carregando...' : 'Sem holds.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'LOTES' ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Lotes</div>
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Itens</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Erros</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lotes.length ? (
                  lotes.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{l.nomeLote}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{l.tipoExecucao}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{l.statusLote}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{l.totalItens}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{l.totalErros}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-500" colSpan={5}>
                      {loading ? 'Carregando...' : 'Sem lotes.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'AUDITORIA' ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Auditoria</div>
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Evento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Recurso</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Descrição</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {auditoria.length ? (
                  auditoria.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{a.tipoEvento}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{a.recurso}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{a.descricaoEvento}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{a.createdAt}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-500" colSpan={4}>
                      {loading ? 'Carregando...' : 'Sem auditoria.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

