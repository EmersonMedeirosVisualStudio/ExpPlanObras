'use client';

import { useCallback, useEffect, useState } from 'react';
import { GrcApi } from '@/lib/modules/grc/api';
import type { GrcActionPlanDTO } from '@/lib/modules/grc/types';

export default function PlanosAcaoClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<GrcActionPlanDTO[]>([]);
  const [out, setOut] = useState<any>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await GrcApi.listarPlanosAcao({ pagina: 1, limite: 50 });
      setRows(data);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar'));
    } finally {
      setLoading(false);
    }
  }, []);

  const criarExemplo = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setOut(null);
    try {
      const body = {
        origemTipo: 'RISCO',
        origemId: 1,
        titulo: 'Plano de ação (exemplo)',
        descricao: 'Plano criado para validação do fluxo GRC.',
        criticidade: 'ALTA',
        dataLimite: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        criterioAceite: 'Evidência anexada e validação concluída',
      };
      const res = await GrcApi.criarPlanoAcao(body);
      setOut(res);
      await carregar();
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao criar'));
    } finally {
      setLoading(false);
    }
  }, [carregar]);

  const aprovar = useCallback(
    async (id: number) => {
      setLoading(true);
      setErr(null);
      setOut(null);
      try {
        const res = await GrcApi.aprovarPlanoAcao(id);
        setOut(res);
        await carregar();
      } catch (e: any) {
        setErr(String(e?.message || 'Erro ao aprovar'));
      } finally {
        setLoading(false);
      }
    },
    [carregar]
  );

  const concluir = useCallback(
    async (id: number) => {
      setLoading(true);
      setErr(null);
      setOut(null);
      try {
        const res = await GrcApi.concluirPlanoAcao(id);
        setOut(res);
        await carregar();
      } catch (e: any) {
        setErr(String(e?.message || 'Erro ao concluir'));
      } finally {
        setLoading(false);
      }
    },
    [carregar]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Planos de Ação</h1>
          <p className="text-gray-600 mt-1">Acompanhamento de remediações e prazos.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={criarExemplo} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Criar exemplo
          </button>
          <button type="button" onClick={carregar} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {out ? <pre className="rounded-lg border bg-white p-3 text-xs overflow-auto">{JSON.stringify(out, null, 2)}</pre> : null}

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Planos</div>
        <div className="overflow-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Título</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Origem</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Prazo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{r.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.titulo}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {r.origemTipo}:{r.origemId}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.statusPlano}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.dataLimite || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {String(r.statusPlano).toUpperCase() === 'ABERTO' ? (
                          <button type="button" className="rounded-lg border px-3 py-1 text-sm" onClick={() => aprovar(r.id)} disabled={loading}>
                            Aprovar
                          </button>
                        ) : null}
                        {String(r.statusPlano).toUpperCase() !== 'CONCLUIDO' ? (
                          <button type="button" className="rounded-lg border px-3 py-1 text-sm" onClick={() => concluir(r.id)} disabled={loading}>
                            Concluir
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-500" colSpan={6}>
                    {loading ? 'Carregando...' : 'Sem planos.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

