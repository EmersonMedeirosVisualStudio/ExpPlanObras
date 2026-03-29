'use client';

import { useCallback, useEffect, useState } from 'react';
import { ContinuidadeApi } from '@/lib/modules/continuidade/api';
import type { CriseDTO } from '@/lib/modules/continuidade/types';

export default function CrisesClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [crises, setCrises] = useState<CriseDTO[]>([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await ContinuidadeApi.listarCrises({ pagina: 1, limite: 50 });
      setCrises(rows);
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
          <h1 className="text-2xl font-semibold text-gray-900">Crises</h1>
          <p className="text-gray-600 mt-1">Gestão de crise: status e histórico.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={carregar} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Crises recentes</div>
        <div className="overflow-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Código</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Título</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Severidade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Aberta</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {crises.length ? (
                crises.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{c.codigo}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{c.titulo}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{c.severidade}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{c.statusCrise}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{c.abertaEm || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-500" colSpan={5}>
                    {loading ? 'Carregando...' : 'Sem crises.'}
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

