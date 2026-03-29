'use client';

import { useCallback, useEffect, useState } from 'react';
import { GrcApi } from '@/lib/modules/grc/api';
import type { GrcRiskDTO } from '@/lib/modules/grc/types';

export default function RiscosClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<GrcRiskDTO[]>([]);
  const [out, setOut] = useState<any>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await GrcApi.listarRiscos({ pagina: 1, limite: 50 });
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
        codigo: `RISK_${Date.now()}`,
        titulo: 'Risco de exemplo (GRC)',
        descricao: 'Risco operacional cadastrado para validação do módulo GRC.',
        categoriaRisco: 'OPERACIONAL',
        modulo: 'CORE',
        processoNegocio: 'Operação',
        statusRisco: 'ABERTO',
        impacto: 'ALTO',
        probabilidade: 'POSSIVEL',
        apetiteScore: 9,
        toleranciaScore: 12,
        origemRisco: 'INICIAL',
      };
      const res = await GrcApi.criarRisco(body);
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
          <h1 className="text-2xl font-semibold text-gray-900">Riscos</h1>
          <p className="text-gray-600 mt-1">Registro de riscos com score inerente e residual.</p>
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
        <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Riscos</div>
        <div className="overflow-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Código</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Título</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Categoria</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Score (inerente)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Score (residual)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{r.codigo}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.titulo}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.categoriaRisco}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.statusRisco}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.scoreInerente}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.scoreResidual ?? '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-500" colSpan={6}>
                    {loading ? 'Carregando...' : 'Sem riscos.'}
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

