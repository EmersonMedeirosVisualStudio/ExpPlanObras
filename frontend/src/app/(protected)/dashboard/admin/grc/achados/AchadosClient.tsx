'use client';

import { useCallback, useEffect, useState } from 'react';
import { GrcApi } from '@/lib/modules/grc/api';
import type { GrcFindingDTO } from '@/lib/modules/grc/types';

export default function AchadosClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<GrcFindingDTO[]>([]);
  const [out, setOut] = useState<any>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await GrcApi.listarAchados({ pagina: 1, limite: 50 });
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
        titulo: 'Achado de exemplo (GRC)',
        descricao: 'Achado criado para validar o fluxo de não conformidade.',
        gravidade: 'ALTA',
        statusAchado: 'ABERTO',
        recomendacao: 'Criar plano de ação e validar efetividade.',
      };
      const res = await GrcApi.criarAchado(body);
      setOut(res);
      await carregar();
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao criar'));
    } finally {
      setLoading(false);
    }
  }, [carregar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Achados</h1>
          <p className="text-gray-600 mt-1">Não conformidades, causas raiz e recomendações.</p>
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
        <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Achados</div>
        <div className="overflow-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Título</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Gravidade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Prazo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{r.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.titulo}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.gravidade}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.statusAchado}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.prazoTratativaEm || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-500" colSpan={5}>
                    {loading ? 'Carregando...' : 'Sem achados.'}
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

