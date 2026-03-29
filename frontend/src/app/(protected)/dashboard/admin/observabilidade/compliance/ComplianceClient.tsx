'use client';

import { useCallback, useEffect, useState } from 'react';
import { PlaybooksApi } from '@/lib/modules/playbooks/api';

export default function ComplianceClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [casos, setCasos] = useState<any[]>([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await PlaybooksApi.listarCasosCompliance({ pagina: 1, limite: 50 });
      setCasos(rows);
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
          <h1 className="text-2xl font-semibold text-gray-900">Compliance</h1>
          <p className="text-gray-600 mt-1">Casos formais com evidências e trilha auditável.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={carregar} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Casos</div>
        <div className="overflow-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Criticidade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Incidente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Atualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {casos.length ? (
                casos.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{c.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{c.tipoCaso}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{c.statusCaso}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{c.criticidade}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{c.incidenteId || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{c.updatedAt}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-500" colSpan={6}>
                    {loading ? 'Carregando...' : 'Sem casos.'}
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

