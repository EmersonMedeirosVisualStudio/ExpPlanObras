'use client';

import { useCallback, useEffect, useState } from 'react';
import { ObservabilidadeApi } from '@/lib/modules/observabilidade/api';
import type { ObservabilityEventDTO } from '@/lib/modules/observabilidade/types';

type TabKey = 'TIMELINE' | 'ALERTAS' | 'INCIDENTES' | 'REGRAS' | 'SAUDE' | 'INTEGRACOES';

function cx(...classes: Array<string | null | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

export default function ObservabilidadeClient() {
  const [tab, setTab] = useState<TabKey>('TIMELINE');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [eventos, setEventos] = useState<ObservabilityEventDTO[]>([]);

  const carregarEventos = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await ObservabilidadeApi.listarEventos({ limite: 50, pagina: 1 });
      setEventos(rows);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'TIMELINE') carregarEventos();
  }, [tab, carregarEventos]);

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Observabilidade</h1>
          <p className="text-gray-600 mt-1">Timeline de eventos, alertas e incidentes.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={carregarEventos} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="border-b">
        <nav className="flex gap-6">
          {(
            [
              { key: 'TIMELINE', label: 'Timeline' },
              { key: 'ALERTAS', label: 'Alertas' },
              { key: 'INCIDENTES', label: 'Incidentes' },
              { key: 'REGRAS', label: 'Regras' },
              { key: 'SAUDE', label: 'Saúde' },
              { key: 'INTEGRACOES', label: 'Integrações' },
            ] as Array<{ key: TabKey; label: string }>
          ).map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cx('py-3 text-sm', tab === t.key ? 'border-b-2 border-blue-600 text-blue-700 font-medium' : 'text-gray-600')}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'TIMELINE' ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Eventos recentes</div>
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Quando</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Categoria</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Evento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Severidade</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Resultado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Origem</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Actor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Rota</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {eventos.length ? (
                  eventos.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{e.ocorridoEm}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.categoria}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.nomeEvento}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.severidade}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.resultado}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.origemTipo}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.actorEmail || e.actorUserId || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.rota || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-500" colSpan={8}>
                      {loading ? 'Carregando...' : 'Sem eventos.'}
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

