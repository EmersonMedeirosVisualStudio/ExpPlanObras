'use client';

import { useCallback, useEffect, useState } from 'react';
import { ContinuidadeApi } from '@/lib/modules/continuidade/api';
import type { DrExecucaoDTO } from '@/lib/modules/continuidade/types';

export default function DrClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [execucoes, setExecucoes] = useState<DrExecucaoDTO[]>([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await ContinuidadeApi.listarExecucoesDr({ pagina: 1, limite: 50 });
      setExecucoes(rows);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Disaster Recovery</h1>
          <p className="text-gray-600 mt-1">Execuções de recuperação e validações.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={carregar} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Execuções</div>
        <div className="overflow-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Plano</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">RTO/RPO Real</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Atualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {execucoes.length ? (
                execucoes.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{e.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{e.planoId}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{e.tipoRecuperacao}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{e.statusExecucao}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{e.rtoRealMinutos || '-'} / {e.rpoRealMinutos || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{e.updatedAt}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-500" colSpan={6}>
                    {loading ? 'Carregando...' : 'Sem execuções.'}
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

